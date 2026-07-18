export const PUBLICATION_GATE_EVALUATOR_VERSION = "publication-gate.v1";
export const FINAL_CONTENT_HASH_VERSION = "sha256-final-content.v1";

export const REQUIRED_PUBLICATION_GATES = [
  "style_structure",
  "grounded_material_claims",
  "citation_validity_coverage",
  "brand_fact_consistency",
  "risk_classification",
  "originality_information_gain",
  "duplication_cannibalization",
  "link_validity",
  "metadata_validity",
  "owner_policy",
  "destination_capability",
  "rollback_or_irreversible_approval",
] as const;

export type RequiredPublicationGate = (typeof REQUIRED_PUBLICATION_GATES)[number];
export type PublicationGateStatus = "passed" | "failed" | "error";

export type PublicationGateCheck = {
  status: PublicationGateStatus;
  evaluatorVersion: string;
  reasons?: readonly string[];
};

export type FinalPublicationContent = {
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: readonly string[];
  bodyMarkdown: string;
};

export type AggregatedPublicationGate = {
  passed: boolean;
  decision: "allow_automatic_publication" | "block";
  evaluatorVersion: typeof PUBLICATION_GATE_EVALUATOR_VERSION;
  evaluatorVersions: Record<RequiredPublicationGate, string | null> & {
    publication_gate: typeof PUBLICATION_GATE_EVALUATOR_VERSION;
  };
  finalContentHash: string | null;
  finalContentHashVersion: typeof FINAL_CONTENT_HASH_VERSION;
  gates: Record<
    RequiredPublicationGate,
    {
      status: PublicationGateStatus | "missing";
      evaluatorVersion: string | null;
      reasons: string[];
    }
  >;
  blockingReasons: string[];
};

function canonicalFinalContent(content: FinalPublicationContent): string {
  return JSON.stringify([
    content.title,
    content.slug,
    content.metaDescription ?? "",
    [...content.tags],
    content.bodyMarkdown,
  ]);
}

export async function hashFinalPublicationContent(
  content: FinalPublicationContent,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalFinalContent(content)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function finalContentErrors(content: FinalPublicationContent): string[] {
  const errors: string[] = [];
  if (!content.title?.trim()) errors.push("Final content title is missing.");
  if (!content.slug?.trim()) errors.push("Final content slug is missing.");
  if (!content.bodyMarkdown?.trim()) errors.push("Final content body is missing.");
  return errors;
}

/**
 * Aggregate the complete Phase 3 publication policy. The input is intentionally
 * partial so runtime omissions become an explicit blocking `missing` result.
 */
export async function aggregatePublicationGate(input: {
  finalContent: FinalPublicationContent;
  gates: Partial<Record<RequiredPublicationGate, PublicationGateCheck>>;
}): Promise<AggregatedPublicationGate> {
  const normalizedGates = {} as AggregatedPublicationGate["gates"];
  const evaluatorVersions = {
    publication_gate: PUBLICATION_GATE_EVALUATOR_VERSION,
  } as AggregatedPublicationGate["evaluatorVersions"];
  const blockingReasons = finalContentErrors(input.finalContent);

  for (const gateName of REQUIRED_PUBLICATION_GATES) {
    const check = input.gates[gateName];
    if (!check) {
      normalizedGates[gateName] = {
        status: "missing",
        evaluatorVersion: null,
        reasons: [`Required gate ${gateName} is missing.`],
      };
      evaluatorVersions[gateName] = null;
      blockingReasons.push(`Required gate ${gateName} is missing.`);
      continue;
    }

    const version = check.evaluatorVersion?.trim() || null;
    const invalidVersion = version === null;
    const invalidStatus = !(["passed", "failed", "error"] as const).includes(check.status);
    const status: PublicationGateStatus = invalidVersion || invalidStatus ? "error" : check.status;
    const reasons = [
      ...(check.reasons ?? []),
      ...(invalidVersion ? [`Required gate ${gateName} has no evaluator version.`] : []),
      ...(invalidStatus ? [`Required gate ${gateName} returned an invalid status.`] : []),
    ];
    normalizedGates[gateName] = {
      status,
      evaluatorVersion: version,
      reasons,
    };
    evaluatorVersions[gateName] = version;
    if (status !== "passed") {
      blockingReasons.push(
        ...(reasons.length > 0 ? reasons : [`Required gate ${gateName} ${status}.`]),
      );
    }
  }

  let finalContentHash: string | null = null;
  try {
    finalContentHash = await hashFinalPublicationContent(input.finalContent);
  } catch {
    blockingReasons.push("Final content hashing failed.");
  }

  const passed = blockingReasons.length === 0 && finalContentHash !== null;
  return {
    passed,
    decision: passed ? "allow_automatic_publication" : "block",
    evaluatorVersion: PUBLICATION_GATE_EVALUATOR_VERSION,
    evaluatorVersions,
    finalContentHash,
    finalContentHashVersion: FINAL_CONTENT_HASH_VERSION,
    gates: normalizedGates,
    blockingReasons,
  };
}

export function publicationGateCheck(
  passed: boolean,
  evaluatorVersion: string,
  reasons: readonly string[] = [],
): PublicationGateCheck {
  return { status: passed ? "passed" : "failed", evaluatorVersion, reasons };
}
