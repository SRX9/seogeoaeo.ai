# SEO_AI

SEO_AI is a SaaS product that researches what a company should write, creates
SEO-ready articles, and publishes them to the user's connected platforms.

## Development

| Task | Command |
| --- | --- |
| Install deps | `npm install` |
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Test | `npm run test` |
| Build (Next.js) | `npm run build` |
| Build (Cloudflare) | `npm run build:cf` |
| Preview on Workers | `npm run preview:cf` |
| Deploy to Cloudflare | `npm run deploy:cf` |
| Generate migration | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |

Copy `.env.example` to `.env.local` and fill in values. Set
`AUTH_DEV_BYPASS=true` locally to preview authenticated dashboard routes before
Phase 1 auth is implemented.

## Stack

- Next.js (App Router) + TypeScript
- Cloudflare Workers via `@opennextjs/cloudflare`
- PlanetScale Postgres + Drizzle ORM
- Tailwind CSS

## Docs

- [Product and architecture plan](docs/content-agent-plan.md)
- [Phased v1 implementation plan](docs/v1-implementation-phases.md)
- [Production setup checklist](docs/production-setup.md)

## Current status

v1 is complete on `main`: auth, billing, brand setup, LLM articles, research
backlog, scheduling/autonomy, publishing connectors, and hardening.

## Production deploy (Cloudflare Workers)

See [docs/production-setup.md](docs/production-setup.md) for the full checklist.

**Stripe billing** (test mode) is provisioned — price IDs are in
[`infra/stripe-products.json`](infra/stripe-products.json).

Quick start:

```bash
# 1. PlanetScale: create Postgres DB, then migrate
export DATABASE_URL="postgresql://..."
npm run db:migrate

# 2. Copy and fill production env, then push Worker secrets
cp .env.production.example .env.production.local
chmod +x scripts/set-worker-secrets.sh
npx wrangler login
./scripts/set-worker-secrets.sh

# 3. Deploy
npm run deploy:cf
```

GitHub Actions deploy (`.github/workflows/deploy.yml`) syncs Worker secrets from
repository secrets on each push to `main`.
