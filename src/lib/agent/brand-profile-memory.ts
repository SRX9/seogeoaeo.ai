import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentMemoryRecords,
  brandProfiles,
  brands,
  type BrandIdentityMemoryPending,
  type BrandProfileMemoryField,
  type BrandProfileMemoryPending,
  type BrandProfileMemoryPendingAssertion,
} from "@/lib/db/schema";
import {
  appendLayeredMemory,
  deriveMemoryContradictionGroup,
  normalizeMemorySubjectKey,
  stableMemoryValueFingerprint,
  type AppendLayeredMemoryInput,
  type MemoryConsumer,
  type MemorySensitivity,
  type StoredMemoryClass,
} from "@/lib/agent/layered-memory";
import {
  correctMemoryRecord,
  MemoryCorrectionError,
  resolveMemoryContradiction,
} from "@/lib/agent/memory-corrections";

export const OWNER_PROFILE_MEMORY_VERSION = "owner-brand-profile-v1" as const;

export type OwnerProfileField = "name" | BrandProfileMemoryField;

export type OwnerBrandProfileSnapshot = {
  brand: {
    id: string;
    name: string;
    memoryProjectionPending?: BrandIdentityMemoryPending;
    updatedAt: Date;
  };
  profile: {
    id: string;
    website: string | null;
    productDescription: string | null;
    audience: string | null;
    tone: string | null;
    seedKeywords: string | null;
    memoryProjectionPending?: BrandProfileMemoryPending;
    updatedAt: Date;
  } | null;
};

export type OwnerProfileMemoryProjection = AppendLayeredMemoryInput & {
  field: OwnerProfileField;
  hasValue: boolean;
  observedAt: Date;
  contradictionGroup: string;
  allowedConsumers: readonly MemoryConsumer[];
};

type ProjectionDefinition = {
  field: OwnerProfileField;
  memoryClass: Extract<StoredMemoryClass, "authoritative_fact" | "preference">;
  subjectKey: string;
  value: string | null;
  observedAt: Date;
  statement(value: string): string;
  emptyStatement: string;
  sensitivity: MemorySensitivity;
  allowedConsumers: readonly MemoryConsumer[];
};

function normalizedValue(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ") ?? "";
}

function stableHash(value: string) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

/** Pure projection seam: only explicit owner-maintained profile fields enter memory. */
export function buildOwnerBrandProfileMemoryProjection(
  snapshot: OwnerBrandProfileSnapshot,
): OwnerProfileMemoryProjection[] {
  const profileUpdatedAt = snapshot.profile?.updatedAt ?? snapshot.brand.updatedAt;
  const definitions: ProjectionDefinition[] = [
    {
      field: "name",
      memoryClass: "authoritative_fact",
      subjectKey: "brand.profile.name",
      value: snapshot.brand.name,
      observedAt: snapshot.brand.updatedAt,
      statement: (value) => `The owner identifies the brand as: ${value}`,
      emptyStatement: "No owner-maintained brand name is currently set.",
      sensitivity: "public",
      allowedConsumers: ["planner", "research", "draft", "audit", "ask"],
    },
    {
      field: "website",
      memoryClass: "authoritative_fact",
      subjectKey: "brand.profile.website",
      value: snapshot.profile?.website ?? null,
      observedAt: profileUpdatedAt,
      statement: (value) => `The brand's primary website is: ${value}`,
      emptyStatement: "No owner-maintained primary website is currently set.",
      sensitivity: "public",
      allowedConsumers: ["planner", "research", "draft", "audit", "ask"],
    },
    {
      field: "product_description",
      memoryClass: "authoritative_fact",
      subjectKey: "brand.profile.product_description",
      value: snapshot.profile?.productDescription ?? null,
      observedAt: profileUpdatedAt,
      statement: (value) => `The owner describes the product as: ${value}`,
      emptyStatement: "No owner-maintained product description is currently set.",
      sensitivity: "internal",
      allowedConsumers: ["planner", "research", "draft", "audit", "ask"],
    },
    {
      field: "target_audience",
      memoryClass: "preference",
      subjectKey: "brand.profile.target_audience",
      value: snapshot.profile?.audience ?? null,
      observedAt: profileUpdatedAt,
      statement: (value) => `Target this owner-selected audience: ${value}`,
      emptyStatement: "No owner-maintained target audience is currently set.",
      sensitivity: "internal",
      allowedConsumers: ["planner", "research", "draft", "ask"],
    },
    {
      field: "tone",
      memoryClass: "preference",
      subjectKey: "brand.profile.tone",
      value: snapshot.profile?.tone ?? null,
      observedAt: profileUpdatedAt,
      statement: (value) => `Use this owner-selected brand tone for drafts: ${value}`,
      emptyStatement: "No owner-maintained brand tone is currently set.",
      sensitivity: "internal",
      allowedConsumers: ["planner", "research", "draft", "ask"],
    },
    {
      field: "seed_keywords",
      memoryClass: "preference",
      subjectKey: "brand.profile.seed_keywords",
      value: snapshot.profile?.seedKeywords ?? null,
      observedAt: profileUpdatedAt,
      statement: (value) => `Prioritize these owner-selected research seed keywords: ${value}`,
      emptyStatement: "No owner-maintained research seed keywords are currently set.",
      sensitivity: "internal",
      allowedConsumers: ["planner", "research", "draft", "ask"],
    },
  ];

  return definitions.map((definition) => {
    const value = normalizedValue(definition.value);
    const statement = value ? definition.statement(value) : definition.emptyStatement;
    return {
      field: definition.field,
      hasValue: value.length > 0,
      memoryClass: definition.memoryClass,
      subjectKey: definition.subjectKey,
      statement,
      content: {
        semanticValue: statement,
        schemaVersion: OWNER_PROFILE_MEMORY_VERSION,
        field: definition.field,
        value: value || null,
      },
      impactLevel: "low",
      sourceType: "owner_input",
      sourceRef: `brand-profile:${definition.field}:${stableHash(statement)}`,
      creator: "owner",
      observedAt: definition.observedAt,
      validFrom: definition.observedAt,
      expiresAt: null,
      confidence: 100,
      verificationState: "owner_approved",
      sensitivity: definition.sensitivity,
      allowedConsumers: definition.allowedConsumers,
      trustLevel: "trusted",
      supersedesId: null,
      contradictionGroup: deriveMemoryContradictionGroup(
        definition.memoryClass,
        definition.subjectKey,
      )!,
      extractionVersion: OWNER_PROFILE_MEMORY_VERSION,
      modelVersion: null,
      dependencies: [],
    };
  });
}

function isExactTrustedProjection(
  row: typeof agentMemoryRecords.$inferSelect,
  projection: OwnerProfileMemoryProjection,
) {
  return (
    stableMemoryValueFingerprint({
      memoryClass: row.memoryClass as StoredMemoryClass,
      statement: row.statement,
      content: row.content,
    }) === stableMemoryValueFingerprint(projection) &&
    row.sourceType === "owner_input" &&
    row.creator === "owner" &&
    row.verificationState === "owner_approved" &&
    row.trustLevel === "trusted" &&
    row.memoryClass !== "owner_policy" &&
    row.allowedConsumers.length === projection.allowedConsumers.length &&
    projection.allowedConsumers.every((consumer) =>
      row.allowedConsumers.includes(consumer),
    )
  );
}

export function isControllingOwnerProfileCorrection(
  row: Pick<
    typeof agentMemoryRecords.$inferSelect,
    "memoryClass" | "sourceType" | "creator" | "verificationState" | "trustLevel"
  >,
) {
  return (
    row.memoryClass === "correction" &&
    row.sourceType === "owner_input" &&
    row.creator === "owner" &&
    row.verificationState === "owner_approved" &&
    row.trustLevel === "trusted"
  );
}

function isOwnerProfileSyncCorrection(row: typeof agentMemoryRecords.$inferSelect) {
  return (
    isControllingOwnerProfileCorrection(row) &&
    row.content.correctionOrigin === "owner_profile_sync"
  );
}

function normalizedStatement(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

type ValidPendingAssertion = BrandProfileMemoryPendingAssertion & {
  writtenAtDate: Date;
};

function validPendingAssertionForProjection(
  assertion: BrandProfileMemoryPendingAssertion | undefined,
  projection: OwnerProfileMemoryProjection,
): ValidPendingAssertion | null {
  if (
    !assertion ||
    typeof assertion.value !== "string" ||
    typeof assertion.revision !== "string" ||
    assertion.revision.length === 0 ||
    typeof assertion.writtenAt !== "string"
  ) {
    return null;
  }
  const projectedValue = normalizedValue(
    typeof projection.content.value === "string" ? projection.content.value : null,
  );
  const writtenAtDate = new Date(assertion.writtenAt);
  if (
    assertion.value !== projectedValue ||
    !Number.isFinite(writtenAtDate.getTime())
  ) {
    return null;
  }
  return { ...assertion, writtenAtDate };
}

function projectionValueMatches(
  row: typeof agentMemoryRecords.$inferSelect,
  projection: OwnerProfileMemoryProjection,
) {
  return stableMemoryValueFingerprint({
    memoryClass: row.memoryClass as StoredMemoryClass,
    statement: row.statement,
    content: row.content,
  }) === stableMemoryValueFingerprint(projection);
}

/** Collapse pre-existing identical replays while retaining immutable history. */
async function collapseIdenticalProjectionRows(
  scope: BrandScope,
  projection: OwnerProfileMemoryProjection,
  now: Date,
) {
  return getDb().transaction(async (tx) => {
    const lockKey = `claudia-memory-contradiction:${scope.workspaceId}:${scope.brandId}:${projection.contradictionGroup}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const rows = await tx
      .select()
      .from(agentMemoryRecords)
      .where(
        and(
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.status, "active"),
          lte(agentMemoryRecords.validFrom, now),
          or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, now)),
          or(
            eq(agentMemoryRecords.contradictionGroup, projection.contradictionGroup),
            and(
              isNull(agentMemoryRecords.contradictionGroup),
              sql`lower(regexp_replace(btrim(${agentMemoryRecords.subjectKey}), '[[:space:]]+', ' ', 'g')) = ${normalizeMemorySubjectKey(projection.subjectKey)}`,
            ),
          ),
        ),
      )
      .orderBy(asc(agentMemoryRecords.id))
      .for("update");
    if (rows.length < 2 || !rows.every((row) => projectionValueMatches(row, projection))) {
      return null;
    }
    const [keeper, ...duplicates] = [...rows].sort((left, right) => {
      const leftAuthority = isExactTrustedProjection(left, projection) ? 1 : 0;
      const rightAuthority = isExactTrustedProjection(right, projection) ? 1 : 0;
      return (
        rightAuthority - leftAuthority ||
        right.observedAt.getTime() - left.observedAt.getTime() ||
        left.id.localeCompare(right.id)
      );
    });
    const duplicateIds = duplicates.map((row) => row.id);
    const settled = await tx
      .update(agentMemoryRecords)
      .set({
        status: "superseded",
        supersededById: keeper.id,
        lifecycleVersion: sql`${agentMemoryRecords.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.status, "active"),
          inArray(agentMemoryRecords.id, duplicateIds),
        ),
      )
      .returning({ id: agentMemoryRecords.id });
    if (settled.length !== duplicateIds.length) {
      throw new Error("Owner profile memory replays changed during consolidation");
    }
    return keeper;
  });
}

async function activeRowsForProjection(
  scope: BrandScope,
  projection: OwnerProfileMemoryProjection,
  now: Date,
) {
  const contradictionGroup = projection.contradictionGroup;
  if (!contradictionGroup) throw new Error("Owner profile projection requires a contradiction group");
  return getDb()
    .select()
    .from(agentMemoryRecords)
    .where(
      and(
        eq(agentMemoryRecords.workspaceId, scope.workspaceId),
        eq(agentMemoryRecords.brandId, scope.brandId),
        eq(agentMemoryRecords.status, "active"),
        lte(agentMemoryRecords.validFrom, now),
        or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, now)),
        or(
          eq(agentMemoryRecords.contradictionGroup, contradictionGroup),
          and(
            isNull(agentMemoryRecords.contradictionGroup),
            sql`lower(regexp_replace(btrim(${agentMemoryRecords.subjectKey}), '[[:space:]]+', ' ', 'g')) = ${normalizeMemorySubjectKey(projection.subjectKey)}`,
          ),
        ),
      ),
    )
    .orderBy(asc(agentMemoryRecords.id));
}

async function acknowledgePendingProfileAssertions(
  scope: BrandScope,
  acknowledgements: BrandProfileMemoryPending,
) {
  if (Object.keys(acknowledgements).length === 0) return;
  await getDb().transaction(async (tx) => {
    const lockKey = `brand-profile-write:${scope.workspaceId}:${scope.brandId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [profile] = await tx
      .select({
        id: brandProfiles.id,
        pending: brandProfiles.memoryProjectionPending,
      })
      .from(brandProfiles)
      .where(
        and(
          eq(brandProfiles.brandId, scope.brandId),
          eq(brandProfiles.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1)
      .for("update");
    if (!profile) return;
    const pending: BrandProfileMemoryPending = { ...profile.pending };
    let changed = false;
    for (const [field, acknowledged] of Object.entries(acknowledgements) as Array<
      [BrandProfileMemoryField, BrandProfileMemoryPendingAssertion]
    >) {
      const current = pending[field];
      if (
        current?.revision === acknowledged.revision &&
        current.value === acknowledged.value &&
        current.writtenAt === acknowledged.writtenAt
      ) {
        delete pending[field];
        changed = true;
      }
    }
    if (!changed) return;
    await tx
      .update(brandProfiles)
      .set({ memoryProjectionPending: pending })
      .where(
        and(
          eq(brandProfiles.id, profile.id),
          eq(brandProfiles.workspaceId, scope.workspaceId),
        ),
      );
  });
}

async function acknowledgePendingBrandAssertion(
  scope: BrandScope,
  acknowledged: BrandProfileMemoryPendingAssertion | undefined,
) {
  if (!acknowledged) return;
  await getDb().transaction(async (tx) => {
    const lockKey = `brand-identity-write:${scope.workspaceId}:${scope.brandId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [brand] = await tx
      .select({ id: brands.id, pending: brands.memoryProjectionPending })
      .from(brands)
      .where(and(eq(brands.id, scope.brandId), eq(brands.workspaceId, scope.workspaceId)))
      .limit(1)
      .for("update");
    const current = brand?.pending.name;
    if (
      !brand ||
      current?.revision !== acknowledged.revision ||
      current.value !== acknowledged.value ||
      current.writtenAt !== acknowledged.writtenAt
    ) {
      return;
    }
    const pending: BrandIdentityMemoryPending = { ...brand.pending };
    delete pending.name;
    await tx
      .update(brands)
      .set({ memoryProjectionPending: pending })
      .where(and(eq(brands.id, brand.id), eq(brands.workspaceId, scope.workspaceId)));
  });
}

async function reconcileProjection(
  scope: BrandScope,
  projection: OwnerProfileMemoryProjection,
  now: Date,
  explicitProfileWriteAt: Date | null,
  attempt = 0,
): Promise<"created" | "corrected" | "unchanged" | "absent"> {
  const active = await activeRowsForProjection(scope, projection, now);
  if (
    active.length > 1 &&
    active.every((row) => projectionValueMatches(row, projection))
  ) {
    const keeper = await collapseIdenticalProjectionRows(scope, projection, now);
    if (!keeper) {
      if (attempt < 2) {
        return reconcileProjection(
          scope,
          projection,
          now,
          explicitProfileWriteAt,
          attempt + 1,
        );
      }
      throw new Error("Owner profile memory replays could not be consolidated");
    }
    if (keeper && isExactTrustedProjection(keeper, projection)) return "unchanged";
    if (attempt < 2) {
      return reconcileProjection(
        scope,
        projection,
        now,
        explicitProfileWriteAt,
        attempt + 1,
      );
    }
    throw new Error("Owner profile memory replay retained untrusted provenance");
  }
  // A manual correction remains controlling unless a durable same-field
  // profile assertion was written later. Unrelated profile saves never create
  // such an assertion, and a later manual correction wins by observed time.
  const activeCorrections = active.filter((row) =>
    isControllingOwnerProfileCorrection(row),
  );
  if (
    active.length > 0 &&
    activeCorrections.length === active.length &&
    activeCorrections.every(
      (row) =>
        normalizedStatement(row.statement) === normalizedStatement(projection.statement) &&
        projection.allowedConsumers.every((consumer) =>
          row.allowedConsumers.includes(consumer),
        ),
    )
  ) {
    return "unchanged";
  }
  if (
    activeCorrections.some((row) => {
      if (isOwnerProfileSyncCorrection(row)) return false;
      return (
        explicitProfileWriteAt === null ||
        row.observedAt.getTime() >= explicitProfileWriteAt.getTime()
      );
    })
  ) {
    return "unchanged";
  }
  if (active.length === 1 && isExactTrustedProjection(active[0], projection)) {
    return "unchanged";
  }
  if (active.length === 0) {
    if (!projection.hasValue) return "absent";
    const observedAt = projection.observedAt && projection.observedAt <= now
      ? projection.observedAt
      : now;
    await appendLayeredMemory(scope, {
      ...projection,
      observedAt,
      validFrom: observedAt,
    });
    return "created";
  }

  const effectiveAt = projection.observedAt && projection.observedAt <= now
    ? projection.observedAt
    : now;
  try {
    if (active.length === 1) {
      await correctMemoryRecord(
        scope,
        {
          targetRecordId: active[0].id,
          expectedLifecycleVersion: active[0].lifecycleVersion,
          correctedStatement: projection.statement,
          reason: `Authenticated owner profile changed ${projection.field}.`,
          effectiveAt,
          origin: "owner_profile_sync",
          profileValue:
            typeof projection.content.value === "string"
              ? projection.content.value
              : null,
          allowedConsumers: projection.allowedConsumers,
        },
        now,
      );
    } else {
      const contradictionGroup = projection.contradictionGroup;
      if (!contradictionGroup) throw new Error("Owner profile correction lost its group");
      await resolveMemoryContradiction(
        scope,
        {
          contradictionGroup,
          subjectKey: projection.subjectKey,
          targetRecordId: active[0].id,
          expectedRecords: active.map((row) => ({
            id: row.id,
            lifecycleVersion: row.lifecycleVersion,
          })),
          correctedStatement: projection.statement,
          reason: `Authenticated owner profile resolved ${projection.field}.`,
          effectiveAt,
          origin: "owner_profile_sync",
          profileValue:
            typeof projection.content.value === "string"
              ? projection.content.value
              : null,
          allowedConsumers: projection.allowedConsumers,
        },
        now,
      );
    }
    return "corrected";
  } catch (error) {
    if (error instanceof MemoryCorrectionError && error.status === 409 && attempt < 2) {
      return reconcileProjection(
        scope,
        projection,
        now,
        explicitProfileWriteAt,
        attempt + 1,
      );
    }
    throw error;
  }
}

/**
 * Lazily reconcile durable, authenticated owner profile data into trusted
 * layered memory. It never projects autonomy, permissions, or policy fields.
 */
export async function reconcileOwnerBrandProfileMemory(
  scope: BrandScope,
  options: {
    now?: Date;
    /** Fields changed by this authenticated write, not merely re-read. */
    explicitFields?: readonly OwnerProfileField[];
  } = {},
) {
  const db = getDb();
  const [[brand], [profile]] = await Promise.all([
    db
      .select({
        id: brands.id,
        name: brands.name,
        memoryProjectionPending: brands.memoryProjectionPending,
        updatedAt: brands.updatedAt,
      })
      .from(brands)
      .where(and(eq(brands.id, scope.brandId), eq(brands.workspaceId, scope.workspaceId)))
      .limit(1),
    db
      .select({
        id: brandProfiles.id,
        website: brandProfiles.website,
        productDescription: brandProfiles.productDescription,
        audience: brandProfiles.audience,
        tone: brandProfiles.tone,
        seedKeywords: brandProfiles.seedKeywords,
        memoryProjectionPending: brandProfiles.memoryProjectionPending,
        updatedAt: brandProfiles.updatedAt,
      })
      .from(brandProfiles)
      .where(
        and(
          eq(brandProfiles.brandId, scope.brandId),
          eq(brandProfiles.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1),
  ]);
  if (!brand) throw new Error("Owner profile memory scope does not contain a brand");
  const reconciliationAt = options.now ?? new Date();
  if (!Number.isFinite(reconciliationAt.getTime())) {
    throw new Error("Owner profile memory clock is invalid");
  }
  const projections = buildOwnerBrandProfileMemoryProjection({ brand, profile: profile ?? null });
  const explicitFields = new Set(options.explicitFields ?? []);
  const acknowledgements: BrandProfileMemoryPending = {};
  let nameAcknowledgement: BrandProfileMemoryPendingAssertion | undefined;
  const summary = { created: 0, corrected: 0, unchanged: 0, absent: 0 };
  for (const projection of projections) {
    const pending = validPendingAssertionForProjection(
      projection.field === "name"
        ? brand.memoryProjectionPending.name
        : profile?.memoryProjectionPending?.[projection.field],
      projection,
    );
    const explicitProfileWriteAt = pending
      ? pending.writtenAtDate
      : explicitFields.has(projection.field)
        ? projection.observedAt
        : null;
    const status = await reconcileProjection(
      scope,
      projection,
      reconciliationAt,
      explicitProfileWriteAt,
    );
    summary[status] += 1;
    if (pending) {
      const acknowledgement = {
        value: pending.value,
        revision: pending.revision,
        writtenAt: pending.writtenAt,
      };
      if (projection.field === "name") {
        nameAcknowledgement = acknowledgement;
      } else {
        acknowledgements[projection.field] = acknowledgement;
      }
    }
  }
  await Promise.all([
    acknowledgePendingProfileAssertions(scope, acknowledgements),
    acknowledgePendingBrandAssertion(scope, nameAcknowledgement),
  ]);
  return summary;
}
