CREATE TABLE IF NOT EXISTS "agent_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "message" text,
  "metadata_json" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "usage_counters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "week_start" text NOT NULL,
  "articles_generated" integer DEFAULT 0 NOT NULL,
  "articles_published" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_jobs"
  ADD CONSTRAINT "agent_jobs_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "usage_counters"
  ADD CONSTRAINT "usage_counters_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_workspace_week_idx"
  ON "usage_counters" ("workspace_id", "week_start");
