#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.production.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy .env.production.example and fill in values first."
  exit 1
fi

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Wrangler is not authenticated. Run: npx wrangler login"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

put_secret() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "skip $key (empty)"
    return
  fi
  printf '%s' "$value" | npx wrangler secret put "$key"
  echo "set $key"
}

REQUIRED=(DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL CRON_SECRET)
for key in "${REQUIRED[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Required variable $key is missing in $ENV_FILE"
    exit 1
  fi
done

for key in \
  DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL ENCRYPTION_KEY CRON_SECRET \
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
  STRIPE_PRICE_INDIE STRIPE_PRICE_STARTUP STRIPE_PRICE_SCALE STRIPE_PRICE_ENTERPRISE \
  STRIPE_PRICE_PACK_SMALL STRIPE_PRICE_PACK_MEDIUM STRIPE_PRICE_PACK_LARGE \
  LLM_BASE_URL LLM_API_KEY LLM_LIGHT_MODEL LLM_HEAVY_MODEL LLM_IMAGE_MODEL \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET \
  TAVILY_API_KEY SERPER_API_KEY KEYWORD_API_URL; do
  put_secret "$key"
done

echo "Worker secrets updated for seo-ai."
