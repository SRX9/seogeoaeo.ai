CREATE TABLE IF NOT EXISTS "brands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brands_workspace_id_idx" ON "brands" USING btree ("workspace_id");
--> statement-breakpoint
-- Seed one brand per existing workspace, carrying the workspace name.
INSERT INTO "brands" ("workspace_id", "name")
SELECT "id", "name" FROM "workspaces"
WHERE NOT EXISTS (SELECT 1 FROM "brands" b WHERE b."workspace_id" = "workspaces"."id");
--> statement-breakpoint
-- Add brand_id (nullable first so we can backfill existing rows).
ALTER TABLE "brand_profiles" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "competitors" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "research_runs" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "article_publications" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
-- Backfill brand_id from the per-workspace default brand created above.
UPDATE "brand_profiles" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "brand_profiles"."workspace_id";
--> statement-breakpoint
UPDATE "competitors" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "competitors"."workspace_id";
--> statement-breakpoint
UPDATE "integrations" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "integrations"."workspace_id";
--> statement-breakpoint
UPDATE "research_runs" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "research_runs"."workspace_id";
--> statement-breakpoint
UPDATE "topics" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "topics"."workspace_id";
--> statement-breakpoint
UPDATE "articles" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "articles"."workspace_id";
--> statement-breakpoint
UPDATE "agent_jobs" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "agent_jobs"."workspace_id";
--> statement-breakpoint
UPDATE "article_publications" SET "brand_id" = b."id" FROM "brands" b WHERE b."workspace_id" = "article_publications"."workspace_id";
--> statement-breakpoint
-- Enforce NOT NULL now that every row has a brand.
ALTER TABLE "brand_profiles" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitors" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "research_runs" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_jobs" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "article_publications" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "article_publications" ADD CONSTRAINT "article_publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Swap workspace-scoped uniqueness for brand-scoped uniqueness.
DROP INDEX IF EXISTS "brand_profiles_workspace_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "integrations_workspace_provider_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_profiles_brand_id_idx" ON "brand_profiles" USING btree ("brand_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_brand_provider_idx" ON "integrations" USING btree ("brand_id","provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitors_brand_id_idx" ON "competitors" USING btree ("brand_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_runs_brand_id_idx" ON "research_runs" USING btree ("brand_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_brand_id_idx" ON "topics" USING btree ("brand_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_brand_id_idx" ON "articles" USING btree ("brand_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_jobs_brand_id_idx" ON "agent_jobs" USING btree ("brand_id");
