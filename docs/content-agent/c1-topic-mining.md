# C1 — Use-case & competitor topic mining

- **Status:** ☑ Done
- **Type:** 🧠 LLM extraction + ⚙️ crawling (extends existing research providers)
- **Depends on:** brand profile + competitors (shipped), `src/lib/research/` provider
  framework (shipped)
- **Unlocks:** the two highest-intent topic sources; the use-case inventory doubles as brand
  context for every other feature

## Goal

Add two evidence-backed topic sources to `researchProviders`, both producing findings that
flow through the existing `runResearch` → `scoreFindings` → backlog pipeline:

1. **Use-case mining** — every real use case of the product becomes a family of
   bottom-of-funnel articles. Buyers searching a use case are choosing a tool *right now*;
   these convert better than anything trends can find.
2. **Competitor content mining** — competitors have already spent money discovering which
   topics work. Read their blogs, find what they cover that we don't, and write **our
   version with our angle** — never a paraphrase of theirs.

## Part 1 — the use-case inventory

**Settled: the inventory is user-facing in Brand settings from day one** — not an internal
artifact. Reasons: (a) a 2-minute human review multiplies the quality of every BOFU article
built on it; (b) it's shared context for research, writing, the visibility agent's
business-type work, and future comparison pages — it deserves one owned home; (c) "Claudia
mapped your product's use cases" is itself an onboarding wow-moment.

- `src/lib/brand/use-cases.ts` — build and persist a structured inventory per brand:
  `{ job, persona, industry?, evidence }` rows, extracted by the light LLM tier from the
  brand profile, homepage/features/docs pages, and existing articles.
- Generated automatically right after the brand profile is saved (onboarding) and refreshed
  when the profile changes; a one-time nudge asks the user to review it ("confirm these are
  right and Claudia writes for the buyers that matter"). Rows are add/edit/disable;
  regeneration never overwrites user edits.
- `src/lib/research/providers/use-cases.ts` — expand inventory rows into candidate articles:
  - *"How to [job] with [product]"* — tutorial shape
  - *"[Product] for [persona]"* — persona landing article
  - *"Best way to [job]"* / *"How do I [job]"* — answer shape (AEO)
  - *"[Us] vs [competitor]"* and *"[Competitor] alternative for [persona]"* — comparison
    shape; classic BOFU, highest conversion intent we can write for
- Each finding carries `intentTier: "bofu"`, its inventory row as evidence, and a thesis
  like *"someone searching this is picking a tool this week."*

## Part 2 — competitor content mining

- Extend `src/lib/research/providers/rss-sitemap.ts` (or add `competitor-content.ts`):
  crawl competitor blog sitemaps/RSS (URLs already collected in the brand profile), fetch
  post titles + descriptions (+ body for the top candidates), and classify each with the
  light LLM tier: topic cluster, use case, intent tier, article shape.
- Persist to a `competitor_content` table (`id`, `brand_id`, `competitor_id`, `url`, `title`,
  `topic`, `intent`, `shape`, `first_seen`, `last_seen`) so the diff below is incremental —
  new posts since last run are themselves a signal ("they just started covering X").
- **Gap diff:** cluster their topics against our published articles → findings like *"They
  have 12 posts on invoicing-for-agencies; we have 0."* Coverage without a gap ranks lower.
- **Popularity proxies** (rank their topics by what's actually working for them):
  - internal-link count from elsewhere on their own site (they promote their winners);
  - pages that show up as citations in our V5.5 answer runs — an engine already cites their
    page for a tracked prompt, so a better page on that exact topic is a targeted strike.
- **The angle rule (binding):** the finding's brief must state *our* angle — our use case,
  our data, our opinion, our customer's story. Prompts must never receive competitor text to
  rewrite; they receive the *topic*, the *intent*, and *our* raw material. We steal the
  demand, never the words.

## Part 3 — unified backlog scoring

- Extend `scoreFindings` + the topic record with: `source` (use_case | competitor_gap | gsc
  | question | trend), `intentTier` (bofu | mofu | tofu), `evidence` (jsonb), `thesis`
  (one owner-readable line, shown in the backlog UI).
- Ranking: intent tier first, then evidence strength; an idea confirmed by ≥2 sources gets a
  multiplier. Dedupe by topic cluster across sources (same logic the fix queue uses for
  findings).
- Backlog UI: show the source badge + thesis on every topic so the user always sees *why*
  Claudia wants to write it.

## Acceptance

- [ ] Use-case inventory auto-generates at onboarding, lives in Brand settings with a
      review nudge; rows add/edit/disable; regenerating preserves user edits.
- [ ] Use-case provider emits BOFU candidates (tutorial / persona / answer / comparison)
      with evidence + thesis.
- [ ] Competitor provider crawls sitemaps/RSS incrementally, classifies posts, and emits gap
      findings ranked by their popularity proxies.
- [ ] No prompt anywhere receives competitor article text as writing input.
- [ ] Backlog shows source badge, intent tier, and thesis per topic; multi-source topics
      rank higher; duplicates merge.
- [ ] Both providers run inside the existing weekly `runResearch` (idempotent, metered as
      `research_run` — no new credit key).
