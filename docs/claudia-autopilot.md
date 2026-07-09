# Claudia Autopilot — the zero-input SEO/AEO/GEO employee

> **Status: in progress.** Master plan for turning the product from "a dashboard with an
> agent in it" into "an agent with a workshop behind her."
> It absorbs [V8.5](visibility-suite/phase-v8-surface/v8.5-claudia-visibility-agent.md),
> [V7.3](visibility-suite/phase-v7-autofix/v7.3-scheduled-reaudits.md), and parts of
> [V8.6](visibility-suite/phase-v8-surface/v8.6-growth-funnel.md), and it changes two settled
> defaults: **the free operating tier goes away** (plan + trial becomes onboarding step 3) and
> **autonomy defaults to on** (paid users hired an employee; she should start working, not wait).
>
> **Agent OS shell (shipped):** primary nav is **Claudia · Inbox · Reports · Brand**.
> Topics, fix queue, site health, AI answers, toolbox, and the full job log live under
> **Brand → Workshop** (and show a Workshop chrome banner with “Back to Claudia”). Home =
> presence + Ask + proof + needs-you + live work stream. Inline inbox approvals + live
> polling + marketing hire narrative shipped in later phases.


---

## 1. The thesis

Today the user does the work and Claudia helps. Every surface proves it:

- The dashboard shows a **checklist of things the user must do**.
- `/visibility` asks the user to **type a URL** the brand profile already contains.
- Research, audits, answer checks, and benchmarks are **buttons the user must remember to press**.
- Autonomy is something the user must discover in settings and opt into.

The inversion: **the user's entire job is three verbs — pay, connect, approve.** Everything
else is Claudia's job, unprompted. She sets herself up, monitors, fixes, writes, publishes,
and reports every week — and every screen in the app is either *her showing her work* or
*her asking for one of those three verbs*.

This is what makes the product SOTA rather than another SEO toolbox: the competition sells
tools and dashboards; we sell an employee who is already working when you walk in Monday
morning. The moat is the closed loop no point-tool has: **she audits the site, fixes what she
finds, writes content her own auditor grades, publishes it through the user's CMS, watches
GSC for what worked, and feeds that back into what she writes and fixes next.**

### The Zero-Input Rule (binding, like the owner-language rule)

> No surface may ever ask the user for information the brand profile, an integration, or a
> previous run already holds. If Claudia can derive it, she derives it. If she must guess,
> she guesses, states the guess, and lets the user correct it — correction is cheaper than a
> blank form.

First casualty: the `window.prompt("Site URL to audit:")` on `/visibility`. The brand has a
website; asking for it reads as the product not knowing who it works for.

---

## 2. What the user experiences (end to end)

### First session (~3 minutes of user time)

1. **One field: the website URL.** Everything else about the brand — name, product,
   audience, tone, seed keywords, likely competitor — is prefetched by the existing AI
   prefill and shown for a 30-second review, not typed. (The onboarding form keeps its
   steps but they become *confirm* screens, pre-filled and skippable.)
2. **One question: "How should Claudia work?"**
   - **Autopilot (recommended, default):** she publishes articles herself and applies safe
     fixes herself. Everything logged, everything reversible.
   - **Copilot:** she prepares everything and asks before publishing or changing anything.
   That's the whole autonomy question at onboarding. Per-category fine-tuning lives in
   settings for the 5% who want it.
3. **Pick a plan, start the trial.** Paid-first: no free operating tier (see §6). Stripe
   `trialing` already counts as active everywhere (`ACTIVE_SUBSCRIPTION_STATUSES`), so the
   trial *is* a subscription and every gate simply works.
4. **Ignition.** The moment the subscription is live, Claudia's Setup Run starts — the user
   watches a live progress narration (same pattern as the prefill overlay: "Auditing your
   site… Asking ChatGPT about your category… Sizing up your competitor…"). They can leave;
   it finishes without them and emails the Day-0 brief.

### The Setup Run (Claudia onboards herself — no user steps)

One-time orchestrated pipeline, per brand, idempotent, all from the brand profile:

| Step | What she does | Machinery (exists?) |
|---|---|---|
| 1. First audit | Full audit of `brand.website` | ✅ `run-audit.ts` — just feed it the brand URL |
| 2. Seed tracked prompts | LLM generates the plan's prompt quota from the profile (category, use cases, "best X for Y" buyer questions), saves them user-editable | 🆕 small LLM step → existing `tracked_prompts` table |
| 3. First answer check | Runs the prompts across ChatGPT/Perplexity/Gemini | ✅ V5.5 `answers.ts` |
| 4. Competitor baseline | Benchmarks the onboarding competitor; if none given, discovers one | ✅ benchmark + discovery exist |
| 5. Topic research | First research run; topics carry traffic theses (C1) | ✅ `runResearch` |
| 6. Quick-win fixes | Prepares llms.txt, schema, meta fixes from audit findings — applies the safe ones on Autopilot, queues them on Copilot | ✅ `apply-fix.ts` + fix queue |
| 7. First article | Writes article #1 the same day (within plan cap) | ✅ daily pipeline, invoked once |
| 8. Day-0 brief | "Here's where you stand, here's my plan for the week" — in-app + email | 🆕 report step |

Setup Run cost is **plan-included** (it's the trial's job to show value, and the golden
path already promised the first audit free). Steps are Workflow-checkpointed like the daily
pipeline so retries never double-spend.

The two things Claudia genuinely cannot do herself become **unlock cards**, not checklist
items: *connect Search Console* (proof + smarter topics) and *connect your CMS* (she
publishes and fixes your real site). Each card states what she unlocks, in her voice:
"Connect Search Console and I'll find the queries you already almost rank for."

### Every week after (zero user time required)

The standing loop, one brand-day at a time on the existing cron:

- **Daily:** write within plan cap (existing), sync GSC/GA4 traffic (landing on this branch),
  check for finished fixes to verify.
- **Plan cadence (weekly/monthly per tier):** re-audit → diff → dispatch fixes by autonomy
  level; answer check across engines; competitor delta.
- **Event-driven:** score drop ≥5 → immediate alert; article reaches page 1 → she queues
  follow-ups (C4); fix verified by re-audit → ✓ with score gain attributed.
- **Weekly:** the report (§5). One email, one employee, both halves of her job.

The user's recurring surface area: read one email, occasionally tap **Approve** on
something she prepared, occasionally tap **Connect** on an unlock card. That's the product.

---

## 3. The Overview page — Claudia's desk, not a stats page

`/dashboard` today is KPI tiles + a to-do checklist + tables. Rebuild it as the place where
you check on your employee. Section order = the questions an owner actually has, in order:

1. **"Is it working?" — the proof strip.** One hero band with the three proof-stack numbers
   side by side: visibility score + delta, answer share ("in 4 of 10 AI answers, up from 2"),
   and real traffic vs baseline (once GSC is connected; until then the third slot *is* the
   GSC unlock card). Each links to its deep page (`/visibility`, `/visibility/answers`,
   proof panel). Never a bare score — always delta + context (existing display rules apply).
2. **"What is she doing?" — the Claudia brief.** A short first-person narrative card,
   LLM-written from structured run data, regenerated by the daily job — *"This week I
   published 2 articles (your 'X vs Y' piece is already getting impressions), fixed 3 schema
   issues, and your score moved 61 → 68. Next: I'm watching the answer drop on Perplexity
   and drafting the comparison page targeting it."* Plus the literal next-run schedule
   ("next audit: Monday"). This card is the product's face — it must exist even in week 1
   (the Day-0 brief seeds it).
3. **"What does she need from me?" — the approval inbox.** ONE unified queue merging
   article drafts awaiting review (Copilot mode), fixes awaiting approval (Level 1), and
   unlock cards (connect GSC / CMS / upgrade nudges). Every row: what, why it matters in
   owner language, one primary button. Empty state on Autopilot: "Nothing — I've got it."
   This is the only section that ever asks the user to do anything.
4. **"What has she made?" — the content engine.** Recent articles with status and — once
   C4 lands — their performance ("page 1 for 'x'"), and the topic queue with traffic theses
   ("writing next: … because GSC shows you at #14 with 480 impressions/mo").
5. **New-brand state:** while the Setup Run is in flight, section 1 is replaced by her live
   setup progress — *her* steps with checkmarks appearing, not the user's. The current
   `OnboardingChecklist` (user to-dos) is retired; the only user-facing setup items are the
   two connect cards, which live in the approval inbox like everything else she needs.

All of it keeps the section-loading convention: instant shell, independent `<Section>`s,
granular endpoints (new: `/api/dashboard/brief`, `/api/dashboard/inbox`, `/api/dashboard/proof`).

---

## 4. Fixing the surfaces that fight the thesis

- **`/visibility` never asks for a URL.** `POST /api/visibility/audit` stops taking `url`
  from the client and resolves the active brand's website server-side (keep an optional
  `url` override for the Toolbox / multi-property cases only). The page button becomes
  "Re-audit now" — and once scheduled audits run, it's a secondary action, because audits
  happen on cadence whether or not anyone presses it. If a brand somehow has no website,
  the page deep-links to brand settings — it never grows its own URL field.
- **Answers page:** prompts arrive pre-seeded from the Setup Run; the page is for *editing*
  the prompt list, never for cold-starting it.
- **Topics/Articles:** stay, but framed as *her* backlog and *her* output; manual "generate
  now" remains as an override, not the path.
- **Settings:** the Autopilot/Copilot dial up top; per-category autonomy toggles beneath it
  (the V8.5 `agent_autonomy` table), each showing "what she did last" for trust. The
  existing writer `autonomyMode` (FULL_AUTO/REVIEW) folds into the same dial — one concept,
  not two systems: Autopilot = FULL_AUTO + Level 2 on `auto` categories; Copilot = REVIEW +
  Level 1 everywhere.

### Autonomy defaults (changed from V8.5)

V8.5 said "default Level 0, nudge to Level 1." That was right for freemium; it's wrong for
paid-first. A paying customer who chose "Autopilot" at onboarding has given consent —
making her idle-by-default reads as the product stalling. New defaults:

| Onboarding choice | Writer | Fixes (`auto`-capable categories) | Everything else |
|---|---|---|---|
| **Autopilot** (default) | Publishes | Applies + logs + reversible | Proposes in inbox |
| **Copilot** | Drafts for review | Proposes in inbox | Proposes in inbox |

Unchanged guardrails: only `fix_capability: auto` categories can ever auto-apply; every
action is an Activity row with a stored before-state and a working revert; she never touches
off-site surfaces; credits remain the hard budget and she degrades gracefully (skip + log +
one throttled email) when they run out.

---

## 5. The weekly report — the retention engine

One email per brand per week (plus the in-app `/reports` archive), in Claudia's voice,
ordered by the proof stack, covering both halves of her job:

1. Score + delta, answer share + delta, clicks/AI-referrals vs baseline.
2. What I fixed (n of your plan's included fixes — never a bill), what's awaiting approval.
3. What I published and why (topic theses), early performance of prior articles (C4 lines).
4. What I'm doing next week.
5. One ask, max, if any (approve X / connect Y) — a report that always demands something
   trains people to ignore it.

Score-drop alerts stay separate and immediate. Notification prefs respected. This replaces
the digest spec'd inside V8.5 — same content contract, promoted to a named weekly ritual.

---

## 6. Packaging: paid-first with a trial

- **The free operating tier is removed.** An unsubscribed workspace can complete brand
  setup but Ignition is gated on an active subscription — plan selection (with 7-day trial)
  is step 3 of onboarding, before any value is delivered rather than after. Rationale: every
  free-tier surface (credit banners, "enough for N articles" arithmetic, idle-agent states)
  exists to manage a user we don't monetize, and it forces the agent to default to *off*.
  Killing it deletes UI and unlocks autonomous-by-default.
- **Free public tools stay** on the marketing site (V8.6 golden path unchanged): snapshot,
  crawler check, llms.txt, "what does AI say about you" — they're the funnel, and the
  signup carry-over token now lands the domain directly into onboarding step 1.
- Trial = full plan experience including the Setup Run. The Day-0 brief and first weekly
  report land inside the trial window — the conversion moment is her first report, not a
  paywall screen.
- The plan-features table from `01-product-surface.md` §Pricing ships verbatim on the
  pricing page; caps unchanged (`plans.ts` already encodes them).

---

## 7. Implementation plan

Ordered by user-visible impact per unit of work. Each phase ships alone.

### AP1 — Zero-input audits (tiny; do first)
Audit route resolves the brand website server-side; `/visibility` loses the URL prompt;
empty-website edge deep-links to settings. *Touches:* `api/visibility/audit/route.ts`,
`visibility/page.tsx`.

### AP2 — Ignition: paid-first onboarding + Setup Run
Onboarding rework (prefill-confirm steps, Autopilot/Copilot question, plan+trial step,
gate on subscription) and the Setup Run pipeline with live progress UI + Day-0 brief.
*Touches:* onboarding page/form, `src/lib/jobs/setup-run.ts` (new, Workflow-driven like the
daily pipeline), prompt-seeding LLM step, `checkout` flow, free-tier banner removal.
*Absorbs:* V8.6 steps 3–4.

### AP3 — Overview rebuild: proof strip, brief, approval inbox
The four sections from §3 + granular endpoints; retire `OnboardingChecklist`; unify draft
and fix approvals into one inbox component. The Claudia brief generator (structured runs →
short narrative) lives in `src/lib/agent/brief.ts` and is refreshed by the daily job.
*Touches:* `dashboard/page.tsx`, new components, new API routes.

### AP4 — The standing loop: scheduled audits + answer checks + dispatch
Cadence check per plan (`visibilityCapsForPlan`) inside the daily cron → audit → diff →
per-category autonomy dispatch (queue / propose / apply) → verify + attribute score gains.
`agent_autonomy` table + settings section; fold writer `autonomyMode` into the dial.
*Touches:* `src/lib/jobs/visibility-agent.ts` (new), schema, settings UI. Remember the
worker cron is patched into `.open-next/worker.js` by `build-cloudflare.mjs` — extend the
source it patches from. *Absorbs:* V8.5 + V7.3.

### AP5 — The weekly report
Weekly digest assembly (both halves), email template in Claudia's voice, `/reports` archive
page, score-drop alert. *Touches:* `src/lib/email/templates.ts`, report assembler, reports
page. *Depends on:* AP4 for fix/audit lines; degrades gracefully before GSC connects.

### Dependency reality check (as of this branch)

- ✅ Shipped: audit engine, fix queue, `apply-fix.ts`, V5.5 answer tracking, plan caps
  (`visibilityCapsForPlan`), daily cron + Workflow, out-of-credits email, prefill.
- ◐ In flight: GSC/GA4 traffic sync (`google-traffic.ts`, this branch) — proof strip slot 3
  and C2 topic mining light up when it lands.
- ☐ Not started: C2 (GSC query mining), C4 (performance loop) — the report and brief get
  strictly better when they land but nothing above blocks on them.

---

## 8. What this explicitly does NOT change

- The engine contracts (every finding carries `fix_capability`/`fix_payload`; every analyzer
  is a pure `run(input)` entry-point). Autopilot is orchestration on top, never a fork.
- Owner language, proof-stack ordering, "proof is never metered," fixes plan-included never
  per-fix, credits as the single budget with ledger idempotency.
- The Toolbox (still the practitioner escape hatch; still secondary).
- She still never touches off-site surfaces (Wikipedia/Reddit/YouTube stay `guided`), and
  marketing copy still may not imply she does.
