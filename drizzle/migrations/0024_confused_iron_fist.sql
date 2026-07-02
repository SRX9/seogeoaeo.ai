CREATE TABLE "traffic_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"date" text NOT NULL,
	"clicks" integer,
	"impressions" integer,
	"avg_position" real,
	"ai_referrals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "traffic_snapshots" ADD CONSTRAINT "traffic_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traffic_snapshots_brand_id_idx" ON "traffic_snapshots" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_snapshots_brand_source_date_unique" ON "traffic_snapshots" USING btree ("brand_id","source","date");