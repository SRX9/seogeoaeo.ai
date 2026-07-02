# 00 — Build principles (read before any ticket)

Shared context every ticket assumes. Don't repeat it in tickets — link here.
Packaging, navigation, and pricing live in [`01-product-surface.md`](01-product-surface.md).

---

## Stack mapping (inspiration → ours)

The `inspiration-code/` reference is **Python + Claude Code skill `.md` files**. Our app is
**Next.js (App Router) + TypeScript on Cloudflare Workers** (`@opennextjs/cloudflare`), **Drizzle
+ PlanetScale Postgres**, Better Auth, Stripe, Tailwind. Translate, don't copy-run.

| Inspiration | Ours |
|---|---|
| Python `requests` | Workers `fetch()` |
| `BeautifulSoup` / `lxml` | `linkedom` or `node-html-parser` (Workers-compatible); `HTMLRewriter` for streaming |
| Deterministic `.py` scorers | Pure TS modules in `src/lib/visibility/` (port **1:1**, keep weights/regexes) |
| LLM-judged skill `.md` rubrics | Structured prompts to our LLM utility (content-roadmap Phase 3), JSON out + Zod |
| Claude subagents (parallel) | `Promise.all` inside a **Cloudflare Workflow** |
| `~/.geo-prospects/*.json` files | Drizzle/Postgres tables |
| Cron skill triggers | **Cloudflare Cron** |

## The six rules

1. **Deterministic-first.** Port the Python scorers field-for-field. Keep **exact** weights,
   thresholds, regexes. Same input must always yield the same score. Unit-test against fixed HTML
   so the score never drifts. (`inspiration-code/docs/scoring-methodology.md` → "Caveats".)
2. **LLM rubrics → structured prompts.** Encode the rubric **tables, point allocations, and output
   template** from the agent `.md` verbatim into the system prompt. **Require JSON**, validate with
   Zod. `heavy` tier for judgement (E-E-A-T, platform), `light` for extraction/classification.
3. **Fetch RAW HTML in the Worker.** Never a markdown-converted version — `<head>` JSON-LD + meta
   must survive (the reason `fetch_page.py` exists instead of WebFetch; see `agents/geo-schema.md`).
   Use the realistic desktop UA from `fetch_page.py` → `DEFAULT_HEADERS`.
4. **Respect quality gates** (`inspiration-code/geo/SKILL.md` → "Quality Gates"): ≤50 pages/audit,
   30s fetch timeout, ~1s between requests, ≤5 concurrent, always honor robots.txt, skip >80%
   duplicate pages.
5. **Every analyzer is dual-mode.** Expose one pure entry-point `run(input) → ToolResult`
   callable identically from the audit Workflow, a standalone Toolbox route, and the agent.
   Never assume the analyzer only runs inside a full audit. (Contract #2 in
   [`01-product-surface.md`](01-product-surface.md).)
6. **No dead findings.** Every finding that can be fixed mechanically MUST carry a
   `fix_payload` plus a `fix_capability` (`auto` | `artifact` | `guided`) so the fix queue
   (V8.2) always has an action button and V7.2 can auto-apply. (Contract #1 in
   [`01-product-surface.md`](01-product-surface.md).)
7. **Owner language on every user-facing string.** SEO/AEO/GEO and sub-score names stay
   internal; surfaces use the display-name map (`01-product-surface.md` → "Owner language").
   Any ticket that renders text to the user pulls labels from `src/lib/visibility/display.ts`,
   never hardcodes the internal taxonomy.

## Where code goes

```
src/lib/visibility/
  fetch-page.ts          # V0.1
  robots.ts sitemap.ts llms.ts blocks.ts   # V0.2
  business-type.ts       # V0.4
  crawler-access.ts      # V1.1 + V1.2
  meta-audit.ts          # V1.4
  citability.ts          # V2.1
  technical.ts           # V2.2 (+ V5.3 agent-readiness)
  schema/                # V3.x (detect.ts validate.ts score.ts generate.ts)
  content.ts             # V4.x
  brand.ts               # V5.1
  platforms.ts           # V5.2
  fixes.ts               # V6.5 + V7.2
  report.ts compare.ts   # V6.x
  scoring.ts             # V2.3 composite
  types.ts               # shared PageSnapshot, Finding, AuditResult, etc.
src/server/visibility/   # Workflow + orchestration (runAudit)
src/app/api/visibility/  # route handlers (quick, audit, etc.)
src/db/schema/visibility.ts  # Drizzle tables
```

## Shared data model (Drizzle)

Persist every run so we can show deltas (V6.3) and prove traffic gains.

- **`audits`** — `id`, `workspace_id`, `site_url`, `business_type`, `status`, `overall_score`, the
  six sub-scores (`citability`, `brand`, `eeat`, `technical`, `schema`, `platform`), `created_at`,
  `run_version`.
- **`audit_pages`** — `id`, `audit_id`, `url`, `html_hash`, `status_code`, `meta` (jsonb),
  `headings` (jsonb), `word_count`, `has_ssr_content`, `snapshot` (jsonb = full `PageSnapshot`).
- **`audit_findings`** — `id`, `audit_id`, `pillar` (seo|aeo|geo), `category`, `severity`
  (critical|high|medium|low), `title`, `recommendation`, `fix_capability`
  (auto|artifact|guided, nullable), `fix_payload` (jsonb, nullable — drives V7.2 auto-apply and
  the V8.2 fix-queue action button), `is_resolved`.
- **`citability_blocks`** — `id`, `audit_page_id`, `heading`, `word_count`, `total_score`, `grade`,
  `breakdown` (jsonb of the 5 dims).
- **`schema_blocks`** — `id`, `audit_page_id`, `type`, `format`, `valid`, `rich_result_eligible`,
  `issues` (jsonb).
- **`brand_signals`** — `id`, `audit_id`, `platform`, `status`, `score`, `evidence` (jsonb).
- **`platform_scores`** — `id`, `audit_id`, `platform`, `score`, `breakdown` (jsonb).
- **`tracked_prompts`** (V5.5) — `id`, `brand_id`, `prompt`, `source` (suggested|user),
  `active`, `created_at`.
- **`answer_runs`** (V5.5) — `id`, `brand_id`, `prompt_id`, `engine`, `ran_at`,
  `answer_excerpt`, `brand_mentioned`, `brand_cited`, `mentions` (jsonb — per-competitor
  mention/citation flags).
- **`traffic_snapshots`** (V6.6) — `id`, `brand_id`, `source` (gsc|ga4), `date`, `clicks`,
  `impressions`, `avg_position`, `ai_referrals` (jsonb — sessions per engine).

## Shared TypeScript types (define in `types.ts`, V0.1)

`PageSnapshot`, `RobotsResult`, `SitemapResult`, `LlmsTxtResult`, `ContentBlock`, `Finding`,
`SubScore`, `AuditResult`. Tickets reference these by name.

## Scoring source of truth

Composite weights + bands live in `inspiration-code/docs/scoring-methodology.md`. The composite is:

```
overall = citability*0.25 + brand*0.20 + eeat*0.20 + technical*0.15 + schema*0.10 + platform*0.10
```

Bands: 90–100 Excellent · 75–89 Good · 60–74 Fair · 40–59 Poor · 0–39 Critical.

## Ticket conventions

- Every ticket lists **exact files to create**, **ordered build steps**, a **`📐 Build from`**
  block (the inspiration source), and a **checkbox acceptance** list.
- Mark the ticket's `Status` line and the index checkbox as you progress.
- Deterministic tickets (⚙️) must ship with unit tests. LLM tickets (🧠) must ship with a Zod
  schema for the model output + at least one fixture test of the parser/aggregator.
