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
  secrets: Record<string, string>;
  origin: string;
};

export type PublishResult = {
  ok: boolean;
  externalUrl?: string;
  error?: string;
  /** Set when the destination was left untouched because content was unchanged. */
  skipped?: boolean;
};

export type PublishingAdapter = {
  id: IntegrationProviderId;
  publish(article: PublishArticle, context: PublishContext): Promise<PublishResult>;
};

export type PublicationStatus = "pending" | "published" | "failed";
