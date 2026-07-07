# C2 — Search Console query mining

- **Status:** ☐ Not started
- **Type:** ⚙️ Deterministic (data pull + clustering; no LLM judgement needed to find demand)
- **Depends on:** [V6.6](../visibility-suite/phase-v6-reporting/v6.6-traffic-proof.md) (the
  GSC OAuth connection — one connect, two jobs: proof *and* topics), C1 (scoring fields)
- **Unlocks:** the only topic source with **Google-verified demand for this exact domain**;
  CTR-gap findings for the fix queue

## Goal

Mine the brand's own Search Console data for the highest-ROI content work that exists:
queries where Google *already* shows the site. No keyword tool guesses — this is demand
Google has receipts for. Three plays, run weekly inside the research cron:

## The three plays

1. **Striking distance** — queries at position **8–25** with meaningful impressions.
   One focused article (or a refresh of the page that's almost there) moves page 2 → page 1,
   where the clicks are. This is the single highest-ROI unit of content work; it should
   dominate the backlog whenever it exists.
   → emits a topic finding: `source: "gsc"`, evidence `{query, page, position, impressions}`,
   thesis *"Google shows us at #14 for this — 480 impressions/mo waiting on page 2."*

2. **CTR gap** — queries at position **≤10** where CTR is well below the expected curve for
   that position. We rank; the title/description/answer-block doesn't earn the click.
   → emits a **fix-queue finding**, not a topic: `fix_capability: auto` with a rewritten
   title/meta as the `fix_payload` (Claudia can apply it via V7.2 through the publishing
   connector). This is the cheapest traffic in the whole product — no new article needed.

3. **Query-family expansion** — cluster the query report by intent (deterministic:
   normalize, stem, group by shared head terms; no LLM required for v1). Where a family has
   impressions spread across pages but **no dedicated page**, emit a new-article finding for
   the cluster head. Accidental impressions for adjacent topics are a bonus signal of demand
   we never planned for.

## Files to create

- `src/lib/research/providers/gsc-queries.ts` — the provider: reads stored query rows, runs
  the three plays, emits findings through the existing pipeline.
- `src/lib/integrations/gsc.ts` (from V6.6) — extend the pull with the query+page dimension
  report (top N rows, 28-day window).
- `src/lib/db/schema/content.ts` — `search_queries` table: `id`, `brand_id`, `query`,
  `page`, `clicks`, `impressions`, `position`, `period_start`, `period_end`. Refreshed
  weekly, idempotent per (brand, query, page, period).
- Thresholds in one config object (min impressions, position bands, CTR-expectation curve) —
  tune without hunting through logic.

## Build steps

1. Extend the V6.6 sync with the query-level report; persist `search_queries`.
2. Implement the three plays as pure functions over the table (unit-test with fixture rows —
   deterministic in, deterministic out).
3. Register the provider in `researchProviders`; findings carry C1's `source`/`evidence`/
   `thesis` fields. CTR-gap results insert into `audit_findings` instead (deduped like any
   other finding).
4. Not-connected state: the provider no-ops and the backlog shows a one-line nudge —
   *"Connect Search Console and Claudia can see what Google already almost-ranks you for."*
   (The strongest connect incentive in the app; V6.6's proof panel is the second.)
5. Rides the weekly `research_run` — no new credit key; the GSC read itself is free (proof
   is never metered).

## Acceptance

- [ ] Weekly sync fills `search_queries` idempotently from the shared V6.6 connection.
- [ ] Striking-distance and query-family topics appear in the backlog with query-level
      evidence and theses; thresholds configurable in one place.
- [ ] CTR-gap emits auto-capable meta-rewrite findings into the fix queue, deduped.
- [ ] All three plays unit-tested against fixture data.
- [ ] Graceful, motivating empty state when GSC isn't connected.
