import { devtoAdapter } from "@/lib/publishing/adapters/devto";
import { ghostAdapter } from "@/lib/publishing/adapters/ghost";
import { hashnodeAdapter } from "@/lib/publishing/adapters/hashnode";
import { markdownExportAdapter } from "@/lib/publishing/adapters/markdown";
import { webhookAdapter } from "@/lib/publishing/adapters/webhook";
import { wordpressAdapter } from "@/lib/publishing/adapters/wordpress";
import type { IntegrationProviderId } from "@/lib/integrations/providers";
import type { PublishingAdapter } from "@/lib/publishing/types";

export const publishingAdapters: PublishingAdapter[] = [
  markdownExportAdapter,
  webhookAdapter,
  devtoAdapter,
  hashnodeAdapter,
  wordpressAdapter,
  ghostAdapter,
];

const adapterById = new Map<IntegrationProviderId, PublishingAdapter>(
  publishingAdapters.map((adapter) => [adapter.id, adapter]),
);

export function getPublishingAdapter(provider: IntegrationProviderId) {
  return adapterById.get(provider) ?? null;
}
