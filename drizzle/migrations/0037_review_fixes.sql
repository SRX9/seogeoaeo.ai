DROP INDEX "weekly_reports_brand_week_idx";--> statement-breakpoint
ALTER TABLE "weekly_reports" ALTER COLUMN "brand_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN "site_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_runs" ADD COLUMN "ref_id" text;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN "regressed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_site_week_idx" ON "weekly_reports" USING btree ("workspace_id","site_url","week_start");