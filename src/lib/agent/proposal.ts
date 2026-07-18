export const DEFAULT_ACTION_POLICY_VERSION = "claudia-policy-v1";

export type ActionProposalMaterial = {
  actionType: string;
  capability: string;
  resourceRef: string;
  beforeState?: unknown;
  afterState: unknown;
  destination?: string | null;
  modelPromptVersion?: string | null;
  policyVersion: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Proposal material must contain finite numbers");
  }
  return value;
}

export function canonicalProposalJson(material: ActionProposalMaterial): string {
  return JSON.stringify(
    canonicalize({
      actionType: material.actionType,
      capability: material.capability,
      resourceRef: material.resourceRef,
      beforeState: material.beforeState ?? null,
      afterState: material.afterState,
      destination: material.destination ?? null,
      modelPromptVersion: material.modelPromptVersion ?? null,
      policyVersion: material.policyVersion,
    }),
  );
}

export async function computeActionProposalHash(
  material: ActionProposalMaterial,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalProposalJson(material)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

