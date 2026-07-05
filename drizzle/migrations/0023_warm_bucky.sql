CREATE TABLE "answer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answer_excerpt" text,
	"brand_mentioned" boolean DEFAULT false NOT NULL,
	"brand_cited" boolean DEFAULT false NOT NULL,
	"mentions" jsonb
);
--> statement-breakpoint
CREATE TABLE "tracked_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"source" text DEFAULT 'suggested' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_runs" ADD CONSTRAINT "answer_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_runs" ADD CONSTRAINT "answer_runs_prompt_id_tracked_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."tracked_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_prompts" ADD CONSTRAINT "tracked_prompts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_runs_brand_id_idx" ON "answer_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "answer_runs_prompt_id_idx" ON "answer_runs" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "tracked_prompts_brand_id_idx" ON "tracked_prompts" USING btree ("brand_id");