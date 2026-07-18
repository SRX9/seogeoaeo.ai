import { wordpressArticleMetaUpdateAdapter } from "@/lib/connectors/wordpress";

export const connectorAdapters = [wordpressArticleMetaUpdateAdapter] as const;

export function getConnectorAdapter(
  provider: string,
  capability: string,
) {
  return connectorAdapters.find(
    (adapter) => adapter.provider === provider && adapter.capability === capability,
  ) ?? null;
}
