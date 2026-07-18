import type { IntegrationProviderId } from "@/lib/integrations/providers";

export type ConnectorCapability =
  | "article.create"
  | "article.update"
  | "article.meta.update"
  | "article.schema.update"
  | "site.meta.update"
  | "site.schema.update"
  | "robots.update"
  | "llms_txt.update"
  | "rollback.supported";

const CONNECTOR_CAPABILITIES: ReadonlySet<string> = new Set<ConnectorCapability>([
  "article.create",
  "article.update",
  "article.meta.update",
  "article.schema.update",
  "site.meta.update",
  "site.schema.update",
  "robots.update",
  "llms_txt.update",
  "rollback.supported",
]);

const CAPABILITIES: Record<IntegrationProviderId, readonly ConnectorCapability[]> = {
  // Export creates a local, replaceable artifact and never mutates a live site.
  markdown_export: ["article.create", "rollback.supported"],
  webhook: ["article.create"],
  devto: ["article.create", "article.update"],
  hashnode: ["article.create", "article.update"],
  wordpress: ["article.create", "article.update", "article.meta.update"],
  ghost: ["article.create", "article.update", "article.meta.update"],
  medium: [],
  reddit: [],
  x_post: [],
  x_article: [],
  linkedin_post: [],
  linkedin_article: [],
};

export function connectorCapabilities(
  provider: IntegrationProviderId,
): readonly ConnectorCapability[] {
  return CAPABILITIES[provider];
}

export function connectorHasCapability(
  provider: IntegrationProviderId,
  capability: ConnectorCapability,
): boolean {
  return CAPABILITIES[provider].includes(capability);
}

export function isConnectorCapability(value: unknown): value is ConnectorCapability {
  return typeof value === "string" && CONNECTOR_CAPABILITIES.has(value);
}
