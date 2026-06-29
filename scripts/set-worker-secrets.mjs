#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const envFile = resolve(process.argv[2] ?? ".env.production");
// In CI there is no dotenv file; values come from process.env (GitHub Actions
// secrets) instead. Locally we read .env.production. Either source is fine.
const useEnvFallback = !existsSync(envFile);

const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "ENCRYPTION_KEY", "CRON_SECRET"];
const secretNames = [
  ...required,
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_INDIE",
  "STRIPE_PRICE_STARTUP",
  "STRIPE_PRICE_SCALE",
  "STRIPE_PRICE_ENTERPRISE",
  "STRIPE_PRICE_PACK_SMALL",
  "STRIPE_PRICE_PACK_MEDIUM",
  "STRIPE_PRICE_PACK_LARGE",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_LIGHT_MODEL",
  "LLM_HEAVY_MODEL",
  "LLM_IMAGE_MODEL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "TAVILY_API_KEY",
  "SERPER_API_KEY",
  "KEYWORD_API_URL",
];

function parseDotenv(source) {
  const values = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function runWrangler(args, options = {}) {
  const command = `pnpm exec wrangler ${args.join(" ")}`;
  return spawnSync(command, {
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: options.input,
    encoding: "utf8",
    shell: true,
  });
}

const auth = runWrangler(["whoami"]);
if (auth.status !== 0) {
  console.error(
    "Wrangler is not authenticated. Run `pnpm exec wrangler login` locally, " +
      "or set CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID in CI.",
  );
  process.exit(auth.status ?? 1);
}

let fileValues = {};
if (useEnvFallback) {
  console.log(`No ${envFile} found; reading secret values from process.env.`);
} else {
  fileValues = parseDotenv(readFileSync(envFile, "utf8"));
}
// Prefer the dotenv file value, fall back to the matching environment variable.
const values = Object.fromEntries(
  secretNames.map((key) => [key, fileValues[key] ?? process.env[key] ?? ""]),
);
const missing = required.filter((key) => !values[key]);
if (missing.length > 0) {
  const source = useEnvFallback ? "environment" : envFile;
  console.error(`Required variables missing in ${source}: ${missing.join(", ")}`);
  process.exit(1);
}

for (const key of secretNames) {
  const value = values[key];
  if (!value) {
    console.log(`skip ${key} (empty)`);
    continue;
  }

  const result = runWrangler(["secret", "put", key], { input: value });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log(`set ${key}`);
}

console.log("Worker secrets updated for seo-ai.");
