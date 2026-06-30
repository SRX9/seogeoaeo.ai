ALTER TABLE "brands" ADD COLUMN "autonomy_mode" text DEFAULT 'FULL_AUTO' NOT NULL;
--> statement-breakpoint
-- Backfill: existing brands inherit their workspace's current autonomy mode so
-- behaviour is preserved when autonomy moves from workspace-level to per-brand.
UPDATE "brands" SET "autonomy_mode" = "w"."autonomy_mode"
FROM "workspaces" "w" WHERE "brands"."workspace_id" = "w"."id";