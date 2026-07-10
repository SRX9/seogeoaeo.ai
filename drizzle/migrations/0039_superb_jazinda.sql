CREATE TABLE "agent_action_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"approval_id" uuid,
	"action_type" text NOT NULL,
	"resource_ref" text NOT NULL,
	"capability" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"before_state" jsonb,
	"applied_change" jsonb NOT NULL,
	"remote_ref" text,
	"rollback_handle" jsonb,
	"status" text DEFAULT 'applied' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verification_result" jsonb,
	"verified_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"action_type" text NOT NULL,
	"resource_ref" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"risk_level" text NOT NULL,
	"expected_benefit" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mission_id" uuid,
	"task_id" uuid,
	"event_type" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"actor" text DEFAULT 'claudia' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"provenance" text NOT NULL,
	"scope" text DEFAULT 'brand' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"key" text DEFAULT 'primary' NOT NULL,
	"objective" text NOT NULL,
	"success_condition" text,
	"horizon" text DEFAULT 'ongoing' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"origin" text DEFAULT 'system_created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"rationale" text NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"version" integer NOT NULL,
	"supersedes_id" uuid,
	"replan_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"plan_version_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"task_type" text NOT NULL,
	"executor" text NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_impact" text,
	"confidence" integer DEFAULT 50 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"required_authority" text DEFAULT 'observe' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempt" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"input" jsonb,
	"artifact_ref" text,
	"outcome_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_approval_id_agent_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."agent_approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plan_versions" ADD CONSTRAINT "agent_plan_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plan_versions" ADD CONSTRAINT "agent_plan_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plan_versions" ADD CONSTRAINT "agent_plan_versions_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_plan_version_id_agent_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."agent_plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_action_ledger_brand_idempotency_idx" ON "agent_action_ledger" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_action_ledger_brand_created_idx" ON "agent_action_ledger" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_ledger_task_idx" ON "agent_action_ledger" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_approvals_brand_status_idx" ON "agent_approvals" USING btree ("brand_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_approvals_task_idx" ON "agent_approvals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_events_brand_created_idx" ON "agent_events" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_task_created_idx" ON "agent_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_brand_kind_key_scope_idx" ON "agent_memory" USING btree ("brand_id","kind","key","scope");--> statement-breakpoint
CREATE INDEX "agent_memory_brand_status_expiry_idx" ON "agent_memory" USING btree ("brand_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_missions_brand_key_idx" ON "agent_missions" USING btree ("brand_id","key");--> statement-breakpoint
CREATE INDEX "agent_missions_brand_status_idx" ON "agent_missions" USING btree ("brand_id","status");--> statement-breakpoint
CREATE INDEX "agent_missions_brand_priority_idx" ON "agent_missions" USING btree ("brand_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_plan_versions_mission_version_idx" ON "agent_plan_versions" USING btree ("mission_id","version");--> statement-breakpoint
CREATE INDEX "agent_plan_versions_brand_window_idx" ON "agent_plan_versions" USING btree ("brand_id","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_brand_idempotency_idx" ON "agent_tasks" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_tasks_brand_status_schedule_idx" ON "agent_tasks" USING btree ("brand_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "agent_tasks_plan_idx" ON "agent_tasks" USING btree ("plan_version_id");--> statement-breakpoint
