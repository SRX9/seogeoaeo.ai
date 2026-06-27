CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"delta" integer NOT NULL,
	"balance_after" integer,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "weekly_article_cap" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "monthly_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "purchased_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "monthly_credit_grant" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "credits_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_workspace_created_idx" ON "credit_ledger" USING btree ("workspace_id","created_at");--> statement-breakpoint
-- Backfill: active subscribers get their plan's monthly credit grant.
UPDATE "subscriptions" SET
	"monthly_credit_grant" = CASE "plan_id"
		WHEN 'indie' THEN 2000
		WHEN 'startup' THEN 5000
		WHEN 'scale' THEN 22000
		WHEN 'enterprise' THEN 130000
		ELSE 0 END,
	"monthly_credits" = CASE "plan_id"
		WHEN 'indie' THEN 2000
		WHEN 'startup' THEN 5000
		WHEN 'scale' THEN 22000
		WHEN 'enterprise' THEN 130000
		ELSE 0 END
WHERE "status" IN ('active', 'trialing');--> statement-breakpoint
-- Backfill: one-time signup-equivalent grant for every workspace (never expires).
UPDATE "subscriptions" SET "purchased_credits" = 100;--> statement-breakpoint
INSERT INTO "credit_ledger" ("workspace_id", "delta", "balance_after", "reason", "ref_type", "ref_id")
SELECT "workspace_id", 100, "purchased_credits", 'signup_grant', 'workspace', "workspace_id"::text
FROM "subscriptions";--> statement-breakpoint
INSERT INTO "credit_ledger" ("workspace_id", "delta", "balance_after", "reason", "ref_type", "ref_id")
SELECT "workspace_id", "monthly_credits", "monthly_credits" + "purchased_credits", 'monthly_grant', 'migration', 'backfill-0013'
FROM "subscriptions"
WHERE "status" IN ('active', 'trialing') AND "monthly_credits" > 0;