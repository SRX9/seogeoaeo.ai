CREATE TABLE "traffic_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"site_url" text,
	"property_id" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "traffic_connections" ADD CONSTRAINT "traffic_connections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_connections" ADD CONSTRAINT "traffic_connections_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traffic_connections_brand_id_idx" ON "traffic_connections" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_connections_brand_source_unique" ON "traffic_connections" USING btree ("brand_id","source");