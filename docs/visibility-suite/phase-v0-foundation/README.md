# Phase V0 — Foundation

Build the shared **fetch / parse / persist / orchestrate** engine every later tool reuses. No
user-facing scoring yet — this is the engine block. All deterministic.

> Read [`../00-principles.md`](../00-principles.md) first.

## Tickets

- [x] ⚙️ [V0.1 — Page fetcher & HTML model](v0.1-page-fetcher.md)
- [x] ⚙️ [V0.2 — robots.txt / sitemap / llms.txt fetchers + block splitter](v0.2-robots-sitemap-llms.md)
- [x] ⚙️ [V0.3 — Audit data model & orchestration Workflow](v0.3-data-model-orchestration.md)
- [x] ⚙️ [V0.4 — Business-type detector](v0.4-business-type-detector.md)

## Phase exit criteria

- `runAudit(siteId)` fetches a real site, stores a `PageSnapshot` + robots/sitemap/llms results +
  detected business type, and completes the Workflow with stub (empty) analyzer scores.
- Shared `types.ts` and Drizzle tables exist and are migrated.
- Every deterministic helper has unit tests against fixed HTML fixtures.
