CREATE TABLE IF NOT EXISTS "research_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "summary" text,
  "findings_json" text,
  "topics_created" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "research_runs"
  ADD CONSTRAINT "research_runs_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "research_run_id" uuid;
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "score" integer;
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "rationale" text;
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "answer_fit" text;
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "evidence_json" text;

ALTER TABLE "topics"
  ADD CONSTRAINT "topics_research_run_id_research_runs_id_fk"
  FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id")
  ON DELETE set null ON UPDATE no action;
