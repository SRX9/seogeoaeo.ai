ALTER TABLE "article_publications" ADD COLUMN IF NOT EXISTS "external_id" text;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "monitor_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN IF NOT EXISTS "brand_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_brand_id_idx" ON "audits" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_findings_brand_id_idx" ON "audit_findings" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "articles_topic_id_unique_idx" ON "articles" USING btree ("topic_id") WHERE "topic_id" IS NOT NULL;
