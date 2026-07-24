import { z } from "zod";
import {
  isConnectorCapability,
  type ConnectorCapability,
} from "@/lib/integrations/capabilities";

export const POLICY_PARSER_VERSION = "policy-parser-v1";
export const DETERMINISTIC_POLICY_VERSION = "claudia-policy-v1";

export const policyCapabilitySchema = z.union([
  z.enum(["observe", "prepare"]),
  z.custom<ConnectorCapability>(isConnectorCapability, "Unknown connector capability"),
]);

export const policyResourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }).strict(),
  z.object({ type: z.literal("destination"), values: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ type: z.literal("destination_except"), values: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ type: z.literal("category"), values: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ type: z.literal("resource"), values: z.array(z.string().min(1)).min(1) }).strict(),
]);

export const policyConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("requires_approval") }).strict(),
  z.object({ type: z.literal("unless_approved") }).strict(),
  z.object({ type: z.literal("until"), value: z.string().min(1) }).strict(),
  z.object({ type: z.literal("except"), value: z.string().min(1) }).strict(),
]);

export const canonicalOwnerPolicySchema = z.object({
  effect: z.enum(["allow", "deny"]),
  capabilities: z.array(policyCapabilitySchema).min(1),
  resources: policyResourceSchema,
  conditions: z.array(policyConditionSchema),
  expiresAt: z.string().datetime().nullable(),
  source: z.literal("owner"),
  originalText: z.string().min(1),
  parserVersion: z.literal(POLICY_PARSER_VERSION),
  policyVersion: z.literal(DETERMINISTIC_POLICY_VERSION),
}).strict();

export type PolicyCapability = z.infer<typeof policyCapabilitySchema>;
export type PolicyResource = z.infer<typeof policyResourceSchema>;
export type PolicyCondition = z.infer<typeof policyConditionSchema>;
export type CanonicalOwnerPolicy = z.infer<typeof canonicalOwnerPolicySchema>;

export type OwnerPolicyInterpretation = {
  kind: "restriction" | "permission_proposal" | "ambiguous" | "unsupported";
  policies: CanonicalOwnerPolicy[];
  summary: string;
};

const NEGATION = /\b(?:never|cannot|can't|may\s+not|must\s+not|do\s+not|don't|dont|avoid)\b/i;
const PERMISSION = /\b(?:you\s+may|you\s+can|i\s+authorize|i\s+allow)\b/i;

const DESTINATIONS: Array<[RegExp, string]> = [
  [/\bwordpress\b/i, "wordpress"],
  [/\bdev(?:\s*\.\s*|\s+)to\b/i, "devto"],
  [/\bghost\b/i, "ghost"],
  [/\bhashnode\b/i, "hashnode"],
  [/\bqiita\b/i, "qiita"],
  [/\bbeehiiv\b/i, "beehiiv"],
  [/\bwrite\s*\.?\s*as\b/i, "writeas"],
  [/\bparagraph\b/i, "paragraph"],
  [/\bbuttondown\b/i, "buttondown"],
  [/\bwebhook\b/i, "webhook"],
  [/\bmarkdown\b/i, "markdown_export"],
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function capabilitiesFromText(value: string): PolicyCapability[] {
  const capabilities: PolicyCapability[] = [];
  if (/\b(?:draft|write|writing|educational\s+content)\b/i.test(value)) {
    capabilities.push("prepare");
  }
  if (/\bpublish(?:ing)?\b/i.test(value)) {
    capabilities.push("article.create", "article.update");
  }
  if (/\bupdate\b/i.test(value) && /\b(?:article|page|competitor)\b/i.test(value)) {
    capabilities.push("article.update");
  }
  if (/\bmeta(?:data)?\b/i.test(value)) {
    capabilities.push(/\barticle\b/i.test(value) ? "article.meta.update" : "site.meta.update");
  }
  if (/\bschema\b/i.test(value)) {
    capabilities.push(/\barticle\b/i.test(value) ? "article.schema.update" : "site.schema.update");
  }
  if (/\brobots(?:\.txt)?\b/i.test(value)) capabilities.push("robots.update");
  if (/\bllms(?:\.txt|\s+txt)?\b/i.test(value)) capabilities.push("llms_txt.update");
  return unique(capabilities);
}

function mentionedDestinations(value: string): string[] {
  return DESTINATIONS.flatMap(([pattern, destination]) =>
    pattern.test(value) ? [destination] : [],
  );
}

function resourceFromText(value: string): PolicyResource {
  const destinations = mentionedDestinations(value);
  const onlyDestination = value.match(/\bonly\s+(?:to\s+)?([^,.;]+)/i)?.[1] ?? "";
  const allowedOnly = mentionedDestinations(onlyDestination);
  if (allowedOnly.length > 0) {
    return { type: "destination_except", values: allowedOnly };
  }
  if (destinations.length > 0) {
    return { type: "destination", values: destinations };
  }
  if (/\bcompetitor\s+pages?\b/i.test(value)) {
    return { type: "category", values: ["competitor_pages"] };
  }
  if (/\bmedical\s+claims?\b/i.test(value)) {
    return { type: "category", values: ["medical_claims"] };
  }
  if (/\bgeneral\s+educational\s+content\b/i.test(value)) {
    return { type: "category", values: ["general_educational_content"] };
  }
  if (/\bthis\s+(?:one\s+)?article\b/i.test(value)) {
    return { type: "resource", values: ["this_article"] };
  }
  return { type: "all" };
}

function conditionsFromText(value: string, effect: "allow" | "deny"): PolicyCondition[] {
  const conditions: PolicyCondition[] = [];
  if (/\b(?:without\s+(?:my\s+)?approval|unless\s+(?:i\s+)?approve)\b/i.test(value)) {
    conditions.push({ type: effect === "deny" ? "unless_approved" : "requires_approval" });
  } else if (/\b(?:only\s+)?after\s+(?:i\s+)?approve|after\s+(?:my\s+)?approval\b/i.test(value)) {
    conditions.push({ type: "requires_approval" });
  }
  const until = value.match(/\buntil\s+([^,.;]+)/i)?.[1]?.trim();
  if (until) conditions.push({ type: "until", value: until.slice(0, 120) });
  const except = value.match(/\bexcept\s+(?:for\s+)?([^,.;]+)/i)?.[1]?.trim();
  if (except) conditions.push({ type: "except", value: except.slice(0, 120) });
  return conditions;
}

function canonicalPolicy(
  originalText: string,
  effect: "allow" | "deny",
  capabilities: PolicyCapability[],
  resources = resourceFromText(originalText),
): CanonicalOwnerPolicy {
  return canonicalOwnerPolicySchema.parse({
    effect,
    capabilities,
    resources,
    conditions: conditionsFromText(originalText, effect),
    expiresAt: null,
    source: "owner",
    originalText,
    parserVersion: POLICY_PARSER_VERSION,
    policyVersion: DETERMINISTIC_POLICY_VERSION,
  });
}

function isRecognizedRestrictiveMix(value: string): boolean {
  return (
    /\bdraft\b[\s\S]*\bbut\b[\s\S]*\b(?:do\s+not|don't|never)\s+publish\b/i.test(value) ||
    /\bavoid\s+medical\s+claims?\b[\s\S]*\bbut\b[\s\S]*\bgeneral\s+educational\s+content\b/i.test(value) ||
    /\bonly\s+(?:to\s+)?(?:wordpress|dev(?:\s*\.\s*|\s+)to|ghost|hashnode)\b/i.test(value)
  );
}

/** Deterministic common-language compiler. Unknown authority grants never pass through it. */
export function interpretOwnerPolicyInstruction(raw: string): OwnerPolicyInterpretation {
  const originalText = raw.trim();
  if (!originalText) return { kind: "unsupported", policies: [], summary: "No instruction." };

  const hasNegation = NEGATION.test(originalText);
  const hasPermission = PERMISSION.test(originalText);
  let capabilities = capabilitiesFromText(originalText);
  if (capabilities.length === 0) {
    return {
      kind: hasNegation || hasPermission ? "ambiguous" : "unsupported",
      policies: [],
      summary: hasNegation || hasPermission
        ? "The instruction changes authority but does not identify a supported capability."
        : "No supported policy instruction was found.",
    };
  }

  // Negation inside an apparent permission ("can never", "may not") is a
  // restriction. A clear split between preparation and publication is also a
  // restriction. Other same-scope allow/deny mixes require clarification.
  if (hasNegation && hasPermission && !isRecognizedRestrictiveMix(originalText)) {
    if (!/\b(?:can\s+never|may\s+not)\b/i.test(originalText)) {
      return {
        kind: "ambiguous",
        policies: [],
        summary: "The instruction contains conflicting permission and prohibition signals.",
      };
    }
  }

  if (hasNegation) {
    // A "draft, but do not publish" restriction governs publication only.
    if (/\bdo\s+not\s+publish|don't\s+publish|never\s+publish/i.test(originalText)) {
      capabilities = ["article.create", "article.update"];
    }
    const policies: CanonicalOwnerPolicy[] = [];
    const only = originalText.match(/\bonly\s+(?:to\s+)?([^,.;]+)/i)?.[1] ?? "";
    const allowedDestinations = mentionedDestinations(only);
    if (allowedDestinations.length > 0) {
      policies.push(
        canonicalPolicy(originalText, "deny", ["article.create", "article.update"], {
          type: "destination_except",
          values: allowedDestinations,
        }),
      );
      const neverClause = originalText.match(/\bnever\s+(?:to\s+)?([^,.;]+)/i)?.[1] ?? "";
      const deniedDestinations = mentionedDestinations(neverClause);
      if (deniedDestinations.length > 0) {
        policies.push(
          canonicalPolicy(originalText, "deny", ["article.create", "article.update"], {
            type: "destination",
            values: deniedDestinations,
          }),
        );
      }
    } else {
      policies.push(canonicalPolicy(originalText, "deny", capabilities));
    }
    return {
      kind: "restriction",
      policies,
      summary: "Restriction compiled and ready to enforce immediately.",
    };
  }

  if (hasPermission) {
    return {
      kind: "permission_proposal",
      policies: [canonicalPolicy(originalText, "allow", capabilities)],
      summary: "Authority expansion requires explicit owner confirmation.",
    };
  }

  return { kind: "unsupported", policies: [], summary: "No authority change was found." };
}

function normalizeResource(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function canonicalPolicyApplies(
  policy: Pick<CanonicalOwnerPolicy, "capabilities" | "resources" | "conditions">,
  input: {
    capability: PolicyCapability;
    resourceRef: string;
    destination?: string | null;
    categories?: readonly string[];
    approvalValidated?: boolean;
  },
): boolean {
  if (!policy.capabilities.includes(input.capability)) return false;
  if (
    policy.conditions.some((condition) => condition.type === "unless_approved") &&
    input.approvalValidated
  ) {
    return false;
  }
  const normalizedRef = normalizeResource(input.resourceRef);
  if (
    policy.conditions.some(
      (condition) =>
        condition.type === "except" &&
        normalizedRef.includes(normalizeResource(condition.value)),
    )
  ) {
    return false;
  }

  const resource = policy.resources;
  if (resource.type === "all") return true;
  const destination = normalizeResource(input.destination ?? input.resourceRef.split(":")[0] ?? "");
  if (resource.type === "destination") {
    return resource.values.map(normalizeResource).includes(destination);
  }
  if (resource.type === "destination_except") {
    return !resource.values.map(normalizeResource).includes(destination);
  }

  if (resource.type === "resource") {
    return resource.values.some((value) => normalizedRef.includes(normalizeResource(value)));
  }
  const categories = input.categories?.map(normalizeResource);
  if (!categories || categories.length === 0) {
    // The executor could not establish that this resource is outside the
    // restriction, so a deny policy fails closed.
    return true;
  }
  return resource.values.map(normalizeResource).some((value) => categories.includes(value));
}
