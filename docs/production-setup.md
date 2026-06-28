# Production setup checklist

This document tracks infrastructure provisioning for SEO_AI on Cloudflare Workers,
PlanetScale Postgres, and Stripe.

## Completed automatically

### Stripe (test mode)

Four subscription products were created in Stripe account `acct_1RNVErSAP0pNkOcM`
(SoulSpace Dev). Price IDs are committed in [`infra/stripe-products.json`](../infra/stripe-products.json).

| Plan | Price ID | Monthly |
| ---- | -------- | ------- |
| Indie | `price_1TiBxXSAP0pNkOcMmd44NfpL` | $29 |
| Startup | `price_1TiBxYSAP0pNkOcM1i1B2m20` | $69 |
| Scale | `price_1TiBxaSAP0pNkOcMN1Gq3kqK` | $199 |
| Enterprise | `price_1TiBxbSAP0pNkOcMojGbiYjz` | $499 |

Copy the Stripe **secret key** from the [Stripe API keys dashboard](https://dashboard.stripe.com/test/apikeys).

## Manual steps required

### 1. PlanetScale Postgres

The PlanetScale MCP token can list databases but cannot run DDL or queries (403).
Create a dedicated database in the [PlanetScale console](https://app.planetscale.com/raj-savaliya):

1. **New database** → PostgreSQL → name `seo-ai` (or `seo_ai`) → region `us-east`
2. Open the `main` branch → **Connect** → copy the **Postgres** connection string
3. Run migrations locally or via GitHub Actions:

```bash
export DATABASE_URL="postgresql://..."
pnpm db:migrate
```

### 2. Cloudflare Worker bootstrap

Wrangler is the fastest way to create the first Worker because secrets cannot be
uploaded until the Worker exists. The first deploy creates:

- Worker `seo-ai`
- Workers Assets from `.open-next/assets`
- Weekly cron trigger `0 9 * * 1`
- Workers observability

```bash
pnpm install
pnpm exec wrangler login
pnpm deploy:cf
```

Note the deployed URL (e.g. `https://seo-ai.<subdomain>.workers.dev`).

### 3. Worker secrets

Fill `.env.production` with production values, set `BETTER_AUTH_URL` to the
public Worker URL from step 2, then upload the values to Cloudflare and redeploy:

```bash
pnpm secrets:cf
pnpm deploy:cf
```

Generate random secrets:

```bash
openssl rand -base64 32 | tr -d '/+=' | head -c 32
```

On Windows without OpenSSL, use any password manager or secret generator that
can create 32+ random characters.

### 4. Stripe webhook

After deploy, register a webhook in [Stripe → Developers → Webhooks](https://dashboard.stripe.com/test/webhooks):

- **Endpoint URL**: `https://<your-worker-url>/api/webhooks/stripe`
- **Events**:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and re-run `pnpm secrets:cf`

After the webhook exists, add `STRIPE_WEBHOOK_SECRET` to `.env.production` and run:

```bash
pnpm secrets:cf
```

### 5. Git-backed deploys

Add these repository secrets so [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) can deploy on push to `main`:

| Secret | Value |
| ------ | ----- |
| `CLOUDFLARE_API_TOKEN` | Workers deploy token ([create](https://dash.cloudflare.com/profile/api-tokens)) |
| `CLOUDFLARE_ACCOUNT_ID` | From Cloudflare dashboard URL or wrangler whoami after login |
| `DATABASE_URL` | PlanetScale Postgres connection string |
| `BETTER_AUTH_URL` | Public Worker URL |
| `BETTER_AUTH_SECRET` | Better Auth signing secret |
| `ENCRYPTION_KEY` | Separate encryption key for saved integration secrets |
| `CRON_SECRET` | Secret used by the Cloudflare cron handler |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | From webhook step |
| `STRIPE_PRICE_INDIE` | `price_1TiBxXSAP0pNkOcMmd44NfpL` |
| `STRIPE_PRICE_STARTUP` | `price_1TiBxYSAP0pNkOcM1i1B2m20` |
| `STRIPE_PRICE_SCALE` | `price_1TiBxaSAP0pNkOcMN1Gq3kqK` |
| `STRIPE_PRICE_ENTERPRISE` | `price_1TiBxbSAP0pNkOcMojGbiYjz` |
| `STRIPE_PRICE_PACK_SMALL` | `price_1Tmrg5SAP0pNkOcM5NwqjtuT` |
| `STRIPE_PRICE_PACK_MEDIUM` | Optional top-up pack price ID |
| `STRIPE_PRICE_PACK_LARGE` | Optional top-up pack price ID |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `LLM_API_KEY` | OpenAI-compatible provider key |
| `LLM_LIGHT_MODEL` | Fast/cheap text model |
| `LLM_HEAVY_MODEL` | Higher-quality text model |
| `LLM_IMAGE_MODEL` | Image model |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional GitHub OAuth |
| `SERPER_API_KEY` | Optional search provider |
| `TAVILY_API_KEY` | Optional fallback search provider |
| `KEYWORD_API_URL` | Optional autocomplete endpoint override |

Optional later: add a [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) binding in `wrangler.jsonc` for connection pooling.

Recommended production flow after bootstrap: push to `main` and let GitHub
Actions run migrations, build OpenNext, deploy the Worker, and sync Worker
secrets. Keep direct `pnpm deploy:cf` for first deploys, emergency rollbacks, or
manual smoke tests from an authenticated workstation.

Windows note: OpenNext warns that Windows is not its best-supported runtime. If
`pnpm build:cf` fails with `EPERM: operation not permitted, symlink ...`, run the
Cloudflare build/deploy from WSL, enable Windows Developer Mode/symlink support,
or use the GitHub Actions Linux deploy path.

## Verify

1. GitHub Actions **Deploy** workflow succeeds on `main`
2. App loads at the Worker URL
3. Sign-in / billing checkout redirects to Stripe
4. Stripe webhook test event returns `200` from `/api/webhooks/stripe`
5. Weekly cron is scheduled (`0 9 * * 1` UTC) in `wrangler.jsonc`
