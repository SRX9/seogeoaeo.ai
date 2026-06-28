-- usage_counters never carried meaningful data before brand scoping (the
-- per-week tallies are recomputed going forward), so clear any throwaway rows
-- to let the NOT NULL brand_id add cleanly. The production table is empty.
DELETE FROM "usage_counters";--> statement-breakpoint
DROP INDEX "usage_counters_workspace_week_idx";--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN "brand_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_brand_week_idx" ON "usage_counters" USING btree ("brand_id","week_start");