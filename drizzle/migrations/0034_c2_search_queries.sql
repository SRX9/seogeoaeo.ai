CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"query" text NOT NULL,
	"page" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"position" real,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_queries_brand_id_idx" ON "search_queries" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_queries_brand_query_page_period_idx" ON "search_queries" USING btree ("brand_id","query","page","period_start");