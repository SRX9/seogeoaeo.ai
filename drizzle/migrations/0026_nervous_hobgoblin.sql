CREATE TABLE "agent_autonomy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"category" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"slug" text NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ALTER COLUMN "audit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN "tool_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_autonomy" ADD CONSTRAINT "agent_autonomy_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_autonomy_brand_category_unique" ON "agent_autonomy" USING btree ("brand_id","category");--> statement-breakpoint
CREATE INDEX "tool_runs_workspace_id_idx" ON "tool_runs" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;