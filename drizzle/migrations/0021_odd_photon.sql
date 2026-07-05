CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"pillar" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"fix_capability" text,
	"fix_payload" jsonb,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"html_hash" text,
	"status_code" integer,
	"meta" jsonb,
	"headings" jsonb,
	"word_count" integer DEFAULT 0 NOT NULL,
	"has_ssr_content" boolean DEFAULT true NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"business_type" text,
	"status" text DEFAULT 'running' NOT NULL,
	"overall_score" real,
	"citability_score" real,
	"brand_score" real,
	"eeat_score" real,
	"technical_score" real,
	"schema_score" real,
	"platform_score" real,
	"discovery" jsonb,
	"error" text,
	"run_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brand_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text NOT NULL,
	"score" real,
	"evidence" jsonb
);
--> statement-breakpoint
CREATE TABLE "citability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_page_id" uuid NOT NULL,
	"heading" text,
	"word_count" integer DEFAULT 0 NOT NULL,
	"total_score" real,
	"grade" text,
	"breakdown" jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"score" real,
	"breakdown" jsonb
);
--> statement-breakpoint
CREATE TABLE "schema_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_page_id" uuid NOT NULL,
	"type" text NOT NULL,
	"format" text DEFAULT 'json-ld' NOT NULL,
	"valid" boolean DEFAULT false NOT NULL,
	"rich_result_eligible" boolean DEFAULT false NOT NULL,
	"issues" jsonb
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_signals" ADD CONSTRAINT "brand_signals_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citability_blocks" ADD CONSTRAINT "citability_blocks_audit_page_id_audit_pages_id_fk" FOREIGN KEY ("audit_page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_scores" ADD CONSTRAINT "platform_scores_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_blocks" ADD CONSTRAINT "schema_blocks_audit_page_id_audit_pages_id_fk" FOREIGN KEY ("audit_page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_findings_audit_id_idx" ON "audit_findings" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_pages_audit_id_idx" ON "audit_pages" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audits_workspace_id_idx" ON "audits" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_signals_audit_id_idx" ON "brand_signals" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "citability_blocks_page_id_idx" ON "citability_blocks" USING btree ("audit_page_id");--> statement-breakpoint
CREATE INDEX "platform_scores_audit_id_idx" ON "platform_scores" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "schema_blocks_page_id_idx" ON "schema_blocks" USING btree ("audit_page_id");