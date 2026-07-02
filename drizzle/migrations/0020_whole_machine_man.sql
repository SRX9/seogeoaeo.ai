CREATE TABLE "brand_use_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"job" text NOT NULL,
	"persona" text NOT NULL,
	"industry" text,
	"evidence" text,
	"origin" text DEFAULT 'generated' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"competitor_name" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"topic" text,
	"intent" text,
	"shape" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "intent_tier" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "thesis" text;--> statement-breakpoint
ALTER TABLE "brand_use_cases" ADD CONSTRAINT "brand_use_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_use_cases" ADD CONSTRAINT "brand_use_cases_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_content" ADD CONSTRAINT "competitor_content_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_content" ADD CONSTRAINT "competitor_content_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_use_cases_brand_id_idx" ON "brand_use_cases" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "competitor_content_brand_id_idx" ON "competitor_content" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_content_brand_url_idx" ON "competitor_content" USING btree ("brand_id","url");