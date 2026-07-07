# C4 — Performance feedback loop

- **Status:** ☐ Not started
- **Type:** ⚙️ Deterministic (data + rules; LLM only for follow-up briefs)
- **Depends on:** [C2](c2-gsc-query-mining.md) (GSC reads), published articles with external
  URLs (shipped), V4.4/V4.5/V6.5 enrich the actions as they land
- **Unlocks:** the compounding moat — a topic engine that learns what works for *this* brand;
  digest lines that read like a real employee reporting results

## Goal

Close the writer's loop. Today Claudia publishes and moves on — nobody checks whether the
article did anything. This ticket makes every published article a tracked experiment with
three possible outcomes, each with an automatic next action. The backlog stops being a
one-way conveyor and becomes a feedback system.

## The watch

- On publish (any connector), register the article URL + its target queries for observation.
- Checkpoints at **day 7 / 28 / 90**: read impressions, clicks, position for the page and its
  target query family from `search_queries` (C2's table — no new pulls needed).
- Persist per-article `performance_checkpoints` (`article_id`, `day`, `impressions`,
  `clicks`, `position`, `verdict`).

## Three verdicts, three actions

| Verdict | Signal | Automatic action |
|---|---|---|
| **Winner** | impressions growing, position ≤ 10 or climbing steadily | **Double down:** queue 2–3 follow-up briefs in the same cluster (subtopics from the query family), interlink them (V4.4 when available); tell the user why |
| **Stalling** | impressions but stuck at position 8–25, or CTR gap | **Refresh, don't rewrite:** new title/meta (auto-fix via V7.2), stronger answer-first block (V6.5), updated date (V4.5). Refreshing an almost-ranking page beats writing a new one |
| **Dead** | day 90, negligible impressions | **Learn and stop:** deprioritize the topic family in backlog scoring; never silently retry the same idea |

## Source-level learning

Once a month, compare outcomes by topic `source` (use_case / competitor_gap / gsc / question
/ trend) for this brand and adjust each source's scoring multiplier (bounded, e.g. 0.5–2.0,
persisted per brand). If GSC-sourced topics keep winning and trend-sourced ones keep dying,
the backlog shifts weight automatically. Simple, transparent, per-brand — show the current
multipliers in the backlog UI so the learning is visible, not spooky.

## Digest integration (V8.5 voice)

The loop is what makes Claudia's reports feel like an employee, not a log file:

> "Your article on invoice reminders reached page 1 (position 7, 1.2k impressions) — I've
> queued two follow-ups. The Stripe-vs-PayPal comparison is stuck at #12, so I refreshed its
> title and answer block. I'm dropping 'productivity tips' topics — three articles, ninety
> days, no traction."

## Files to create

- `src/lib/articles/performance.ts` — checkpoint reads, verdict rules (pure, unit-tested),
  action dispatch.
- `src/lib/db/schema/content.ts` — `performance_checkpoints`; scoring-multiplier column or
  small `topic_source_weights` table per brand.
- `src/lib/jobs/daily.ts` — run due checkpoints inside the existing daily job (cheap reads).
- Backlog + article UI: verdict chip on published articles ("📈 winner · follow-ups queued"),
  source multipliers visible in the backlog.

## Acceptance

- [ ] Publishing registers a watch; checkpoints fire at 7/28/90 days off the daily job.
- [ ] Verdict rules are pure functions with fixture tests (winner / stalling / dead).
- [ ] Winner queues interlinked follow-up briefs; stalling triggers refresh actions through
      the fix-queue machinery; dead lowers the family's score with a visible reason.
- [ ] Source multipliers update monthly, bounded, per brand, visible in the backlog UI.
- [ ] Digest includes at least one performance line whenever a checkpoint fired that week.
- [ ] Works degraded (watch-only, no verdicts) when GSC isn't connected, and says so.
