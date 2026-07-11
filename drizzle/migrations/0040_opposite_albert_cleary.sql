CREATE TABLE "brand_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"description" text,
	"slogan" text,
	"primary_logo_url" text,
	"primary_backdrop_url" text,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'context.dev' NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"next_refresh_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_intelligence" ADD CONSTRAINT "brand_intelligence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_intelligence" ADD CONSTRAINT "brand_intelligence_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_intelligence_brand_id_idx" ON "brand_intelligence" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_intelligence_workspace_id_idx" ON "brand_intelligence" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_intelligence_next_refresh_idx" ON "brand_intelligence" USING btree ("next_refresh_at");