# C3 — Writing style engine (shapes + anti-slop gates)

- **Status:** ☑ Done
- **Type:** 🧠 Prompt architecture + ⚙️ deterministic lint (extends `articles/generate.ts`)
- **Depends on:** nothing new — ship first (see README build order). Gates get stronger as
  V4.2/V4.3/V2.1 land, but the covenant + lint work day one.
- **Unlocks:** every article improves immediately; the "passes our own auditor" story;
  readers who don't bounce

## Goal

Kill the template essay. Today every article is the same organism: pleasant intro, three
dutiful H2s, summary conclusion, ~1,800 hedged words. Readers recognize it as AI in two
sentences, engines increasingly discount it, and it's *boring*. The fix has three parts:
**shape follows topic**, a **style covenant** in every prompt, and **machine gates** that
refuse to publish slop — enforced by our own visibility engine.

## Part 1 — shape follows topic (never a template)

A shape library; the outline step picks one from the topic's intent + evidence and stores it
on the article. The essay skeleton is not in the library.

| Shape | When | Skeleton |
|---|---|---|
| `direct-answer` | question-intent topics (AEO) | 40–60 word answer **first**, then the depth for people who want it |
| `tutorial` | "how to [job]" | prerequisites → numbered steps with real examples → what can go wrong. No intro essay |
| `comparison` | "X vs Y", "Y alternative" | **verdict first**, table, honest tradeoffs — praise the competitor where they're genuinely better; trust is the conversion asset |
| `opinion` | takes, industry commentary | one claim with a spine, argued in first person; the kind of post that gets quoted |
| `checklist` | audits, launches, setups | scannable items with a one-line "why" each |
| `teardown` | examples, case studies | walk a real example, extract the lessons |

## Part 2 — the style covenant (verbatim in the system prompt)

1. **The first sentence earns the read** — an answer, a number, or a claim. Never
   throat-clearing. If the first sentence works without the second, keep it.
2. **Short by default.** 600–1,200 words unless the evidence says the query deserves depth.
   Every paragraph must move the reader forward; cut the ones that only add length.
3. **Write like a person on the team.** First person, contractions, specific numbers and
   examples from *this* brand's world, actual opinions. Address the reader as "you".
4. **No summary conclusions.** Never restate what was just said. End with the next step or
   the sharpest take. "In conclusion" is banned outright.
5. **Vary the rhythm.** Mixed sentence lengths. Not every section the same size. No heading
   every 100 words. Perfect symmetry is an AI tell.
6. **Concrete beats abstract.** "A freelancer invoicing 4 clients loses ~3 hours/month" not
   "many professionals face challenges". If a sentence works for any product, it doesn't
   belong in our article.
7. **One idea per article.** If the outline wants two, that's two articles and an internal
   link. Short and pointed beats long and complete.

## Part 3 — deterministic slop lint (`style-lint.ts`)

Pure TS, runs on every draft, unit-tested. Two check families:

- **Phrase blacklist** (config array, extend forever): "delve", "in today's … landscape/world",
  "it's important to note", "unlock/unleash the power", "game-changer", "elevate",
  "seamlessly", "whether you're a … or a …", "in conclusion", "furthermore/moreover" above a
  density cap, "let's dive in".
- **Structure smells:** near-uniform paragraph lengths, heading-to-word-count ratio too high,
  bullet-lists-of-exactly-three repeated, every section within ±15% of the same length,
  intro that doesn't contain the answer/claim for `direct-answer` shapes.

Lint failures trigger a **targeted rewrite pass** (fix the flagged spans), not a full
regenerate — cheaper and preserves what was good.

## Part 4 — machine gates before publish (our own auditor)

| Gate | Module | Pass condition |
|---|---|---|
| Doesn't read AI | V4.3 detector | below flag threshold, else one humanize pass then re-check |
| Quotable | V2.1 citability | the target block scores ≥ threshold when a question is targeted |
| Readable | V4.2 readability | no wall-of-text flags, heading hierarchy sane |
| Trustworthy | E-E-A-T basics | author, date, and at least one real source present |
| Not slop | `style-lint.ts` | zero blacklist hits, no structure smells |

Gate results are stored on the article (visible in the editor as the V7.1 live scores).
Max 2 rewrite loops, then the draft is flagged for human review instead of publishing —
autonomy never ships slop to cover its quota.

## Part 5 — brand voice memory

- Extend the brand profile's `tone` string into a structured voice doc: words we use, words
  we never use, our stance, 3 example sentences we *would* write.
- **Learn from edits:** when the user edits a draft before approving, diff the versions and
  extract voice rules with the light LLM tier ("user shortens intros; user says 'clients'
  never 'customers'"), append to the voice doc (user-visible, editable). Claudia learns the
  voice the way a real hire does — by being edited.

## Files to create / touch

- `src/lib/articles/shapes.ts` — shape library + picker (intent → shape).
- `src/lib/articles/style-lint.ts` — blacklist + structure checks, pure, tested.
- `src/lib/articles/generate.ts` — covenant into the system prompt; shape-specific outline
  prompts; gate pipeline + rewrite loops.
- `src/lib/brand/voice.ts` — voice doc build/store/apply; edit-diff learning.
- Editor: show gate results per draft (pre-V7.1: a simple pass/fail list is enough).

## Acceptance

- [ ] Outline step picks a shape per topic; the essay skeleton is unreachable.
- [ ] Covenant present in every generation prompt; comparison shape produces verdict-first
      output with honest tradeoffs on a fixture topic.
- [ ] `style-lint` catches seeded slop fixtures (phrases + structure) and passes clean text;
      failures trigger targeted rewrites, capped, then human-review flag.
- [ ] Gates run in order, results persisted per article, autonomy respects the review flag.
- [ ] Editing a draft measurably updates the voice doc; the next draft applies it.
- [ ] Median article length across a test batch lands in the 600–1,200 band with variance
      (not uniform).
