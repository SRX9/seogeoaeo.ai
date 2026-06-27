CREATE TABLE IF NOT EXISTS "article_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "external_url" text,
  "error_message" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "article_publications"
  ADD CONSTRAINT "article_publications_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "article_publications"
  ADD CONSTRAINT "article_publications_article_id_articles_id_fk"
  FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "article_publications_article_provider_idx"
  ON "article_publications" ("article_id", "provider");
