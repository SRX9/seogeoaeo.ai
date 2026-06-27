# AGENTS.md

Guidance for AI agents working in this repository.

## Repository status

SEO_AI is a Next.js SaaS app targeting Cloudflare Workers with PlanetScale
Postgres. v1 is complete on `main` per `docs/v1-implementation-phases.md`.

## Standard commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Test | `npm run test` |
| Build | `npm run build` |
| Cloudflare build | `npm run build:cf` |
| DB migrate | `npm run db:migrate` |

## Services

| Service | Required? | Notes |
|---------|-----------|--------|
| Next.js dev server | For local UI | `npm run dev` |
| PlanetScale Postgres | For DB features | Set `DATABASE_URL` in `.env.local` |
| Cloudflare Workers | For production deploy | `npm run deploy:cf` after wrangler auth |

## Cursor Cloud specific instructions

- **Update script**: `npm install` (idempotent).
- **Local auth preview**: set `AUTH_DEV_BYPASS=true` in `.env.local` to access
  dashboard routes without Better Auth (Phase 1).
- **Database**: set `DATABASE_URL` as a Worker secret (Hyperdrive optional later).
- **Production setup**: see `docs/production-setup.md`; Stripe test prices in `infra/stripe-products.json`.
- **Toolchain**: Node.js v22.x is used; package manager is npm.
- **Git**: use branch prefix `cursor/<name>-5e25` for cloud agent branches.
