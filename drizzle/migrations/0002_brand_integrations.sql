CREATE TABLE IF NOT EXISTS "brand_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "product_description" text,
  "audience" text,
  "tone" text,
  "website" text,
  "seed_keywords" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "competitors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "rss_url" text,
  "sitemap_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "config_json" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "integration_secrets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "integration_id" uuid NOT NULL,
  "secret_key" text NOT NULL,
  "encrypted_value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "brand_profiles"
  ADD CONSTRAINT "brand_profiles_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "competitors"
  ADD CONSTRAINT "competitors_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "integration_secrets"
  ADD CONSTRAINT "integration_secrets_integration_id_integrations_id_fk"
  FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "brand_profiles_workspace_id_idx" ON "brand_profiles" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_workspace_provider_idx" ON "integrations" ("workspace_id", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "integration_secrets_key_idx" ON "integration_secrets" ("integration_id", "secret_key");
