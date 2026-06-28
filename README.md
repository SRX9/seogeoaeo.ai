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
| Push Worker secrets | `pnpm secrets:cf` |
| Generate migration | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |

Use `.env` for local development and `.env.production` for production
deployment values. Set `AUTH_DEV_BYPASS=true` locally only when you want to
preview authenticated dashboard routes without real auth.

## Stack

- Next.js (App Router) + TypeScript
- Cloudflare Workers via `@opennextjs/cloudflare`
- PlanetScale Postgres + Drizzle ORM
- Tailwind CSS

## Docs

- [Product and architecture plan](docs/content-agent-plan.md)
- [Phased v1 implementation plan](docs/v1-implementation-phases.md)
- [SEO·AEO·GEO tools & features catalog](docs/tools-catalog.md)
- [Visibility suite build plan (phased tickets)](docs/visibility-suite/README.md)
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

# 2. First deploy creates the Cloudflare Worker, Assets, and cron trigger
pnpm exec wrangler login
pnpm deploy:cf

# 3. Edit .env.production with production values, then push Worker secrets
pnpm secrets:cf

# 4. Redeploy with production secrets available
pnpm deploy:cf
```

After the first deploy, prefer Git-backed production deploys: GitHub Actions
(`.github/workflows/deploy.yml`) runs migrations, builds OpenNext, deploys the
Worker, and syncs Worker secrets on each push to `main`.
