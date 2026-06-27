# SEO_AI

SEO_AI is a SaaS product that researches what a company should write, creates
SEO-ready articles, and publishes them to the user's connected platforms.

## Development

| Task | Command |
| --- | --- |
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Build (Next.js) | `pnpm build` |
| Build (Cloudflare) | `pnpm build:cf` |
| Preview on Workers | `pnpm preview:cf` |
| Deploy to Cloudflare | `pnpm deploy:cf` |
| Generate migration | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |

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
pnpm db:migrate

# 2. Copy and fill production env, then push Worker secrets
cp .env.production.example .env.production.local
chmod +x scripts/set-worker-secrets.sh
pnpm exec wrangler login
./scripts/set-worker-secrets.sh

# 3. Deploy
pnpm deploy:cf
```

GitHub Actions deploy (`.github/workflows/deploy.yml`) syncs Worker secrets from
repository secrets on each push to `main`.
