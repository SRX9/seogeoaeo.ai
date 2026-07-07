ALTER TABLE "brands" ADD COLUMN "badge_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN "resolved_at" timestamp with time zone;