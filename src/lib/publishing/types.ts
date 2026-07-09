import type { IntegrationConfig, IntegrationProviderId } from "@/lib/integrations/providers";

export type PublishArticle = {
  id: string;
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: string[];
  bodyMarkdown: string;
};

export type PublishContext = {
  workspaceId: string;
  config: IntegrationConfig;
  secrets: Partial<Record<string, string>>;
  origin: string;
  /** Remote post id from a prior successful publish — adapters update when set. */
  externalId?: string | null;
  externalUrl?: string | null;
};

export type PublishResult = {
  ok: boolean;
  externalUrl?: string;
  /** Remote post id to persist for future updates. */
  externalId?: string;
  error?: string;
  /** Set when the destination was left untouched because content was unchanged. */
  skipped?: boolean;
};

export type PublishingAdapter = {
  id: IntegrationProviderId;
  publish(article: PublishArticle, context: PublishContext): Promise<PublishResult>;
};

export type PublicationStatus = "pending" | "published" | "failed";
