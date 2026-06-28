# AGENTS.md

Guidance for AI agents working in this repository.

## Repository status

SEO_AI is a Next.js SaaS app targeting Cloudflare Workers with PlanetScale
Postgres. v1 is complete on `main` per `docs/v1-implementation-phases.md`.

## Standard commands

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (port 3000) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Build | `pnpm build` |
| Cloudflare build | `pnpm build:cf` |
| DB migrate | `pnpm db:migrate` |

## Services

| Service | Required? | Notes |
|---------|-----------|--------|
| Next.js dev server | For local UI | `pnpm dev` |
| PlanetScale Postgres | For DB features | Set `DATABASE_URL` in `.env` |
| Cloudflare Workers | For production deploy | `pnpm deploy:cf` after wrangler auth |

## Cursor Cloud specific instructions

- **Update script**: `pnpm install` (idempotent).
- **Local auth preview**: set `AUTH_DEV_BYPASS=true` in `.env` to access
 dashboard routes without Better Auth (Phase 1).
- **Database**: set `DATABASE_URL` as a Worker secret (Hyperdrive optional later).
- **Production setup**: see `docs/production-setup.md`; Stripe test prices in `infra/stripe-products.json`.
- **Toolchain**: Node.js v22.x is used; package manager is pnpm (see `packageManager` in `package.json`).
- **Git**: use branch prefix `cursor/<name>-5e25` for cloud agent branches.
