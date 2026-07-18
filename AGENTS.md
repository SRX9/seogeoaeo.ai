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
| DB schema sync | `pnpm db:push` (push-based; deploy diffs `src/lib/db/schema` against the live DB) |

Do not start the local dev server unless the user explicitly asks for it.

## UI design rules

These are hard requirements for every new or modified interface:

- Never use pills, chips, badges, or pill-shaped text containers. Render status and metadata as plain text, using semantic text color for emphasis. Reserve circular geometry for genuinely circular elements such as avatars, progress rings, and small status marks.
- Use the free Hugeicons stroke packages for interface icons: `@hugeicons/react` with `@hugeicons/core-free-icons`. Do not add custom inline SVG icons, emojis, sparkles, stars, magic wands, or other AI-cliche iconography. Choose a literal, task-specific icon and inherit color through `currentColor`.
- Never use a HeroUI Button variant containing `soft`, including destructive soft variants. Use the appropriate primary, secondary, outline, ghost, or danger treatment instead.

## Services

| Service | Required? | Notes |
|---------|-----------|--------|
| Next.js dev server | For local UI | `pnpm dev` |
| PlanetScale Postgres | For DB features | Set `DATABASE_URL` in `.env` |
| HeroUI Pro | For Pro UI components | Set `HEROUI_AUTH_TOKEN` in CI; run `pnpm rebuild @heroui-pro/react` after install if types are missing |
| Cloudflare Workers | For production deploy | `pnpm deploy:cf` after wrangler auth |

## Logging (PostHog)

Production logs go: structured `console` JSON → Cloudflare Workers Observability →
PostHog (`posthog-logs` destination). App code uses `logInfo` / `logWarn` /
`logError` from `@/lib/logging/logger`; agent workflows use
`workers/agent/src/logger.ts`.

One-time Cloudflare setup:

1. Workers Observability → Destinations → add Logs destination named `posthog-logs`
2. Endpoint `https://us.i.posthog.com/i/v1/logs` (or EU host)
3. Header `Authorization: Bearer phc_...`
4. Redeploy app + agent workers

Local: set `POSTHOG_PROJECT_TOKEN` (and optional `POSTHOG_HOST`) in `.env` to
also ship OTLP logs while running `pnpm dev`.

## Cursor Cloud specific instructions

- **Update script**: `pnpm install` (idempotent).
- **Local auth preview**: set `AUTH_DEV_BYPASS=true` in `.env` to access
 dashboard routes without Better Auth (Phase 1).
- **Database**: set `DATABASE_URL` as a Worker secret (Hyperdrive optional later).
- **Production setup**: see `docs/production-setup.md`; Stripe test prices in `infra/stripe-products.json`.
- **Toolchain**: Node.js v22.x is used; package manager is pnpm (see `packageManager` in `package.json`).
- **Git**: use branch prefix `cursor/<name>-5e25` for cloud agent branches.
