CREATE TABLE "performance_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"position" real,
	"verdict" text,
	"actions_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_source_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"sample" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_checkpoints" ADD CONSTRAINT "performance_checkpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_checkpoints" ADD CONSTRAINT "performance_checkpoints_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_checkpoints" ADD CONSTRAINT "performance_checkpoints_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_source_weights" ADD CONSTRAINT "topic_source_weights_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performance_checkpoints_brand_id_idx" ON "performance_checkpoints" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_checkpoints_article_day_idx" ON "performance_checkpoints" USING btree ("article_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_source_weights_brand_source_idx" ON "topic_source_weights" USING btree ("brand_id","source");