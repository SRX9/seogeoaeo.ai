# Production setup checklist

This document tracks infrastructure provisioning for SEO_AI on Cloudflare Workers,
PlanetScale Postgres, and Stripe.

## Completed automatically

### Stripe (test mode)

Four subscription products were created in Stripe account `acct_1RNVErSAP0pNkOcM`
(SoulSpace Dev). Price IDs are committed in [`infra/stripe-products.json`](../infra/stripe-products.json).

| Plan | Price ID | Monthly |
|------|----------|---------|
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
npm run db:migrate
```

### 2. Cloudflare Worker deploy

The `seo-ai` Worker does not exist yet. Authenticate wrangler and deploy:

```bash
npx wrangler login
npm run deploy:cf
```

Note the deployed URL (e.g. `https://seo-ai.<subdomain>.workers.dev`).

### 3. Worker secrets

Copy [`.env.production.example`](../.env.production.example) to `.env.production.local`,
fill in secrets, then:

```bash
chmod +x scripts/set-worker-secrets.sh
./scripts/set-worker-secrets.sh
```

Generate random secrets:

```bash
openssl rand -base64 32 | tr -d '/+=' | head -c 32
```

Set `BETTER_AUTH_URL` to the public Worker URL from step 2.

### 4. Stripe webhook

After deploy, register a webhook in [Stripe → Developers → Webhooks](https://dashboard.stripe.com/test/webhooks):

- **Endpoint URL**: `https://<your-worker-url>/api/webhooks/stripe`
- **Events**:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and re-run `set-worker-secrets.sh`

### 5. GitHub Actions secrets

Add these repository secrets so [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) can deploy on push to `main`:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Workers deploy token ([create](https://dash.cloudflare.com/profile/api-tokens)) |
| `CLOUDFLARE_ACCOUNT_ID` | From Cloudflare dashboard URL or wrangler whoami after login |
| `DATABASE_URL` | PlanetScale Postgres connection string |
| `BETTER_AUTH_URL` | Public Worker URL |
| `BETTER_AUTH_SECRET` | Same as Worker secret |
| `CRON_SECRET` | Same as Worker secret |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | From webhook step |
| `STRIPE_PRICE_INDIE` | `price_1TiBxXSAP0pNkOcMmd44NfpL` |
| `STRIPE_PRICE_STARTUP` | `price_1TiBxYSAP0pNkOcM1i1B2m20` |
| `STRIPE_PRICE_SCALE` | `price_1TiBxaSAP0pNkOcMN1Gq3kqK` |
| `STRIPE_PRICE_ENTERPRISE` | `price_1TiBxbSAP0pNkOcMojGbiYjz` |
| `LLM_API_KEY` | OpenAI or compatible provider key |

Optional later: add a [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) binding in `wrangler.jsonc` for connection pooling.

## Verify

1. GitHub Actions **Deploy** workflow succeeds on `main`
2. App loads at the Worker URL
3. Sign-in / billing checkout redirects to Stripe
4. Stripe webhook test event returns `200` from `/api/webhooks/stripe`
5. Weekly cron is scheduled (`0 9 * * 1` UTC) in `wrangler.jsonc`
