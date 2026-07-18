import type { BrandScope } from "@/lib/brand/repository";
import { reconcileOwnerBrandProfileMemory } from "@/lib/agent/brand-profile-memory";
import {
  retrieveSafeMemory,
  type RetrievedMemory,
} from "@/lib/agent/layered-memory";

const DRAFT_MEMORY_CLASSES = [
  "authoritative_fact",
  "preference",
  "correction",
] as const;

const PROFILE_MEMORY_QUERY =
  "brand.profile.name brand.profile.product_description brand.profile.target_audience brand.profile.tone brand.profile.website brand.profile.seed_keywords";

function isTrustedDraftMemory(item: RetrievedMemory) {
  return (
    !item.untrustedData &&
    item.trustLevel === "trusted" &&
    item.creator !== "model_inference" &&
    (item.verificationState === "verified" ||
      item.verificationState === "owner_approved")
  );
}

function renderTrustedDraftMemory(items: readonly RetrievedMemory[]) {
  if (items.length === 0) return null;
  return items
    .map(
      (item) =>
        `- [memory:${item.id}] ${item.memoryClass.replaceAll("_", " ")} / ${item.subjectKey}: ${item.statement} (source: ${item.provenance.sourceRef})`,
    )
    .join("\n");
}

/**
 * Load only server-filtered, trusted brand context for the fixed article
 * workflow. External observations and model inferences never enter the prompt
 * through this path, and a relevant high-impact conflict stops generation.
 */
export async function loadTrustedDraftMemory(
  scope: BrandScope,
  topic: { title: string; keywords?: string | null },
) {
  // Lazy reconciliation covers existing brands that have not reopened profile
  // settings since the layered-memory migration.
  await reconcileOwnerBrandProfileMemory(scope);
  const context = await retrieveSafeMemory({
    ...scope,
    consumer: "draft",
    classes: DRAFT_MEMORY_CLASSES,
    sensitivityCeiling: "internal",
    query: [
      PROFILE_MEMORY_QUERY,
      topic.title,
      topic.keywords,
      "brand product audience tone voice preference positioning",
    ]
      .filter(Boolean)
      .join(" "),
    limit: 12,
    maxChars: 5_000,
  });

  if (context.blockedHighImpact) {
    throw new Error(
      "Article generation is blocked until the owner resolves a relevant high-impact memory conflict.",
    );
  }

  const items = context.items.filter(isTrustedDraftMemory);
  return {
    promptContext: renderTrustedDraftMemory(items),
    evidenceRefs: items.map((item) => `memory:${item.id}`),
    correctedSubjects: items.flatMap((item) =>
      item.memoryClass === "correction" ? [item.subjectKey] : [],
    ),
    truncated: context.truncated,
  };
}

/** Trusted structured overrides for the fixed research workflow. */
export async function loadTrustedResearchMemory(scope: BrandScope) {
  await reconcileOwnerBrandProfileMemory(scope);
  const context = await retrieveSafeMemory({
    ...scope,
    consumer: "research",
    classes: DRAFT_MEMORY_CLASSES,
    sensitivityCeiling: "internal",
    query: `${PROFILE_MEMORY_QUERY} brand product audience tone website seed keywords`,
    limit: 12,
    maxChars: 5_000,
  });
  if (context.blockedHighImpact) {
    throw new Error(
      "Research is blocked until the owner resolves a relevant high-impact memory conflict.",
    );
  }
  const items = context.items.filter(isTrustedDraftMemory);
  const correctionItems = new Map(
    items.flatMap((item) =>
      item.memoryClass === "correction"
        ? [[item.subjectKey, item] as const]
        : [],
    ),
  );
  const canonicalValue = (
    subjectKey: string,
    options: { maxLength: number; website?: boolean; legacyPrefix?: string },
  ): string | null | undefined => {
    const item = correctionItems.get(subjectKey);
    if (!item) return undefined;
    const hasProfileValue = Object.prototype.hasOwnProperty.call(
      item.content,
      "profileValue",
    );
    let value = hasProfileValue
      ? typeof item.content.profileValue === "string"
        ? item.content.profileValue
        : null
      : item.statement;
    if (value === null) return null;
    value = value.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (options.legacyPrefix && value.toLowerCase().startsWith(options.legacyPrefix)) {
      value = value.slice(options.legacyPrefix.length).trim();
    }
    if (options.website) {
      const match = value.match(/https?:\/\/[^\s<>{}\[\]"']+/i);
      if (!match) return null;
      try {
        const url = new URL(match[0]);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url.toString().slice(0, options.maxLength);
      } catch {
        return null;
      }
    }
    return value.slice(0, options.maxLength) || null;
  };
  return {
    overrides: {
      name: canonicalValue("brand.profile.name", {
        maxLength: 120,
        legacyPrefix: "the owner identifies the brand as:",
      }),
      productDescription: canonicalValue("brand.profile.product_description", {
        maxLength: 4_000,
        legacyPrefix: "the owner describes the product as:",
      }),
      audience: canonicalValue("brand.profile.target_audience", {
        maxLength: 500,
        legacyPrefix: "target this owner-selected audience:",
      }),
      tone: canonicalValue("brand.profile.tone", {
        maxLength: 200,
        legacyPrefix: "use this owner-selected brand tone for drafts:",
      }),
      website: canonicalValue("brand.profile.website", {
        maxLength: 2_048,
        website: true,
      }),
      seedKeywords: canonicalValue("brand.profile.seed_keywords", {
        maxLength: 1_000,
        legacyPrefix: "prioritize these owner-selected research seed keywords:",
      }),
    },
    evidenceRefs: items.map((item) => `memory:${item.id}`),
    promptContext: renderTrustedDraftMemory(items),
  };
}
