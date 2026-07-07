# Claudia the Writer — autonomous content engine v2

The upgrade spec for Claudia's **writer half**: how she decides what to write, how she writes
it, and how she learns from what actually drove traffic. Runs **parallel to** the visibility
suite plan (`../visibility-suite/`) — same agent, two responsibilities, one digest.

The v1 content engine (research → topics → generate → publish, `../v1-implementation-phases.md`)
shipped and works. It has two weaknesses this plan fixes:

1. **Topic ideas are exploratory guesses.** Web search + trends produce plausible topics, not
   proven ones. We have three untapped sources of *evidence-backed* demand: the brand's own
   use cases, Google Search Console's record of what the site already almost-ranks for, and
   the content competitors have already validated.
2. **The articles read like LLM articles.** Same intro→three-sections→conclusion skeleton,
   same hedged tone, same length regardless of topic. Readers bounce, and increasingly both
   Google and AI engines discount it.

## The four laws of the writer

1. **No article without a traffic thesis.** Every backlog item carries its evidence: which
   source produced it, what demand it proves, and a one-line thesis — *"Google already shows
   us at #14 for this with 480 impressions/mo"* beats *"this keyword is trending."* If we
   can't say why it will drive traffic, we don't write it.
2. **Sources are ranked by intent.** Use-case/comparison topics (buyers choosing a tool now)
   outrank proven-demand GSC topics, which outrank competitor-validated topics, which outrank
   exploratory question/trend topics. An idea confirmed by two or more sources jumps the queue.
3. **Human writing, machine gates.** The shape of the article follows the topic — never a
   template. Short by default, answer-first, opinionated, zero throat-clearing. And because we
   *own a visibility engine*, every draft is graded by our own tools (AI-tell detector,
   citability, readability) before it can publish. Our writer passes our own auditor.
4. **The loop learns.** After publishing, watch what happened in Search Console: double down
   on winners, refresh stalls, stop writing what never works for this brand. The topic engine
   gets measurably smarter every month — that's the compounding moat.

## Tickets

**Status legend:** ☐ Not started · ◐ In progress · ☑ Done

- [x] 🧠 [C1 — Use-case & competitor topic mining](c1-topic-mining.md) ☑
- [ ] ⚙️ [C2 — Search Console query mining](c2-gsc-query-mining.md) *(shares the V6.6 GSC connection)*
- [x] 🧠 [C3 — Writing style engine (shapes + anti-slop gates)](c3-writing-style.md) ☑
- [ ] ⚙️ [C4 — Performance feedback loop](c4-performance-loop.md)

## Build order & dependencies

1. **C3 first.** Style is the cheapest, most visible upgrade — every article improves the day
   it ships, regardless of where the topic came from.
2. **C1** next (needs only the existing brand profile + research plumbing).
3. **C2** as soon as V6.6 lands (one GSC OAuth serves both proof and topic mining).
4. **C4** last (needs C2's GSC reads + a few weeks of published articles to watch).

All four extend the existing engine — `src/lib/research/` (providers, `runResearch`,
`scoreFindings`), `src/lib/articles/generate.ts`, `src/lib/jobs/daily.ts`, plan caps, and the
`research_run`/`article_generation` credit keys. Nothing here is a rewrite; every ticket
plugs into a seam that already exists.

Settled decision: the C1 use-case inventory is **user-facing in Brand settings from day
one** (auto-generated at onboarding, human-reviewable, edits preserved) — it's shared brand
context, not private plumbing.

## How the two Claudias stay one employee

- One daily job (`src/lib/jobs/daily.ts`) runs both duties; one digest reports both:
  *"I published 2 articles (here's why these topics), fixed 3 visibility issues, your score
  is 74 (▲2), and your article on X reached page 1 — I've queued two follow-ups."*
- The visibility engine grades the writer's output (C3 gates = V4.3/V2.1/V4.2 modules).
- GSC connects once (V6.6) and feeds both proof (traffic panel) and demand (C2 topics).
- CTR-gap findings from C2 land in the **fix queue** as auto-fixable meta rewrites (V7.2).
