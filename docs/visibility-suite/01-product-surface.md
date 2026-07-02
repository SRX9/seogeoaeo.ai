# 01 — Product surface & packaging (how the suite is presented and sold)

> Companion to [`00-principles.md`](00-principles.md) (which governs how the *engine* is built).
> This doc governs how the engine is **packaged, navigated, and monetized**. Every V8 ticket
> assumes it; engine tickets (V0–V7) are unaffected except for the two contracts below.

---

## The packaging decision (settled)

We do **not** ship "35 tools in a sidebar." The customer is a site owner, not an SEO
practitioner — they must never need to know which of 35 analyzers to run. The packaging is:

- **Tools are the engine.** All catalog tools get built exactly as ticketed in V0–V7.
- **The agent is the face.** Claudia (the existing "content employee") also runs visibility:
  she audits on schedule, fixes what she's allowed to, and asks approval for the rest.
- **The fix queue is the interface.** Every finding from every analyzer lands in ONE
  severity-ranked queue with an action button. The user works the queue, not the tools.
- **The proof stack is why they stay.** Not just our score — three layers of proof, ending
  in traffic numbers the customer already trusts (see "The proof stack" below).

**Plus one escape hatch:** a **Toolbox** — every analyzer also available as its own standalone
page for technical users who know exactly what they want, priced per run in credits. Secondary
surface, never the onboarding path.

---

## The proof stack (the sales pitch, in trust order)

An audit score is a number *we* invented; nobody cancels or renews over it alone. Proof comes
in three layers, each more credible than the last, and every surface (dashboard, digest,
reports) presents them in this order:

| Layer | What it says | Who grades it | Ships with |
|---|---|---|---|
| 1. **Score delta** | "Your visibility score went 61 → 74" | We do | V2.3 + V6.3 |
| 2. **Answer share** | "You now appear in 6 of 10 tracked AI answers on Perplexity — up from 2" | The engines do | V5.5 |
| 3. **Real traffic** | "Clicks +23% since baseline; 214 visits from ChatGPT this month" | Their own analytics do | V6.6 |

Layer 2 is also the **demo moment** — "ask ChatGPT about your category; you're not in the
answer, your competitor is" sells harder than any audit. Layer 3 is the **retention moment**.
Rules: layers 2 and 3 are never metered (proof is free to look at), and the score is never
shown without context (delta vs last audit + industry baseline for the site's business type).

---

## Owner language (binding on every user-facing surface)

The internal taxonomy stays SEO/AEO/GEO in code, tickets, and the Toolbox. Owner-facing
surfaces translate it — owners know "Google" and "ChatGPT", not "AEO":

| Internal | Surface label |
|---|---|
| 🔵 SEO | **Google & search** |
| 🟣 AEO | **Answer boxes** (featured snippets, AI Overviews) |
| 🟢 GEO | **AI assistants** (ChatGPT, Perplexity, Gemini) |

Sub-score display names: Citability → **Quotable answers** · Brand → **Brand authority** ·
E-E-A-T → **Trust signals** · Technical → **Site health** · Schema → **Structured data** ·
Platform → **AI engine readiness**. One display-name map (`src/lib/visibility/display.ts`)
is the single source for these strings so UI can't drift. Finding rows follow the same rule
(already in V8.2): "AI assistants can't read this page", never "SSR failure".

---

## Navigation (target sidebar)

Current sidebar (`src/components/layout/app-shell.tsx` → `primaryNav`): Overview, Topics,
Articles, Activity, Brand settings. Target end-state:

| Nav item | Route | What it is | Ships with |
|---|---|---|---|
| Overview | `/dashboard` | Existing dashboard + a Visibility score card | V8.1 |
| **Visibility** | `/visibility` | Hero score with delta + industry baseline, sub-scores, trend, Proof panel (traffic overlay, V6.6), "Run audit" | V8.1 |
| **Fix queue** | `/visibility/fixes` | The merged, severity-ranked findings queue | V8.2 |
| **AI answers** | `/visibility/answers` | Share-of-answer per engine, prompt × engine grid | V5.5 |
| Topics | `/topics` | Existing | — |
| Articles | `/articles` | Existing (gains live editor scores in V7.1) | — |
| **Competitors** | `/visibility/competitors` | Benchmark gap table (lite after V2.3, full after V5) | V6.4 |
| **Reports** | `/visibility/reports` | Monthly delta, traffic proof, PDF download | after V6.1–V6.3 |
| **Toolbox** | `/tools` | Standalone tool pages, grouped by pillar | V8.3 |
| Activity | `/activity` | Existing; audit runs + agent fixes appear here too | — |
| Brand settings | `/settings` | Existing; gains agent-autonomy toggles (V8.5) | — |

Free public tools (snapshot, crawler checker, llms.txt generator, "what AI says about you")
live on the **marketing site**, not the app — see the golden path below and V8.6.

All new pages follow the **section-loading convention**: shell renders instantly, each section
loads independently via `<Section>` + skeleton, granular endpoints (no aggregate calls).

---

## The golden path (first session — spec'd in V8.6)

The funnel is a product surface, not a marketing afterthought. Target first session:

1. **Free result** — visitor runs a free tool (snapshot, crawler check, llms.txt, or the
   "what does AI say about your brand" teaser). Cached, rate-limited, zero credits, no auth.
2. **Capture & carry-over** — result offers "email me the report" + signup; the domain and
   findings carry into signup via a short-lived token.
3. **First audit free** — onboarding pre-fills the brand site and auto-runs one full audit on
   a one-time grant. Never make a stranger pay 50 credits to see value.
4. **First fix in minutes** — land on the fix queue with the top copy-paste (`artifact`)
   finding open.
5. **Proof & share** — next audit shows the delta; nudge to enable Claudia Level 1 and the
   opt-in public score badge.

Every step is instrumented (V8.6); the funnel must be measurable end-to-end.

---

## The fix queue (the product's real interface)

One table, fed by `audit_findings` (see data model in `00-principles.md`), ranked
Critical → High → Medium → Low. Each row shows: pillar badge, title, plain-English impact,
and exactly one primary action, determined by the finding's `fix_capability`:

| `fix_capability` | Button | What happens |
|---|---|---|
| `auto` | **Fix it for me** | Agent applies the `fix_payload` (V7.2) — for surfaces we can reach: our published articles' content/meta/schema **including pushing the update through the user's publishing connectors (WordPress, Ghost, …)**, generated llms.txt, robots.txt block we host copy for |
| `artifact` | **Get the fix** | Copy-paste artifact rendered from `fix_payload` (JSON-LD, robots.txt block, meta tags, llms.txt) |
| `guided` | **Show me how** | Step-by-step instructions (off-site work: Wikipedia, Reddit, YouTube, CMS changes we can't reach) |

The connector clause matters commercially: for a WordPress/Ghost customer, "she fixes it on
your actual site" is literally true — that's the moat claim made real, not a copy-paste demo.

Rows are dismissable and completable; `is_resolved` flips automatically when the next audit
no longer reports the finding (that's the "prove it" moment — show a ✓ with the score gain).

**Engine contract #1 (binding on all V0–V7 tickets):** every finding that *can* be fixed
mechanically MUST carry a `fix_payload` and a `fix_capability`. A finding without an action
is a dead row.

---

## The Toolbox (standalone tools for technical users)

Why it exists: practitioners and technical founders will want direct access ("just validate
my schema"), and per-run credit pricing monetizes them without forcing a bigger plan. Why it's
cheap: the engine already exists — the Toolbox is a thin shell over it.

Rules:

1. **One registry, one shell.** `src/lib/visibility/toolbox-registry.ts` declares each tool
   (slug, name, pillar, description, input kind, credit-cost key, run entry-point, result
   renderer). `/tools` renders the grid from the registry; `/tools/[slug]` renders a shared
   `ToolRunner` shell. Adding a tool to the Toolbox = one registry entry + one result renderer.
   **No per-tool page code.**
2. **Same engine, never a fork.** A Toolbox run calls the *same* `src/lib/visibility/*` module
   the audit workflow calls. Zero duplicated logic.
3. **Results flow back.** Findings from a standalone run are persisted like audit findings and
   appear in the fix queue. The Toolbox is another door into the same room.
4. **Secondary surface.** Toolbox is below the fold in the sidebar, absent from onboarding,
   and every tool page cross-links "or let the agent handle all of this" → `/visibility`.

**Engine contract #2 (binding on all V0–V7 tickets):** every analyzer exposes one pure
entry-point — `run(input) → ToolResult` (findings + score + payload) — callable identically
from the audit Workflow, the Toolbox route, and the agent. No analyzer may assume it only
runs inside a full audit.

---

## Pricing (per job — but never per fix, and never for proof)

Extends the existing single source of truth `src/lib/billing/credits.ts` → `CREDIT_COSTS`
(currently: article_generation 100, research_run 20, competitor_discovery 15) and the
append-only `credit_ledger`. Draft costs — tune before launch, but keep the *shape*:

| Action | Key | Draft cost | Notes |
|---|---|---|---|
| Public free tools & quick snapshot | — | **Free** | Lead-gen; rate-limited + cached by domain, never spends credits, no auth |
| Full site audit | `visibility_audit` | 50 | The flagship job (≤50 pages); first one free via V8.6 grant |
| Auto-fix | — | **Included in plan** | Monthly cap per tier — see plans table. Never per-fix: an employee is salaried, not a taxi meter |
| On-demand answer check | `answer_run` | 10 | All engines × tracked prompts, run now; scheduled checks come from the plan cadence |
| Competitor benchmark | `competitor_benchmark` | 40 | Per competitor |
| PDF report | `pdf_report` | 25 | Markdown/in-app report is free with an audit |
| Toolbox run — deterministic ⚙️ | `tool_run_basic` | 5 | Crawler access, meta audit, llms.txt, schema detect… |
| Toolbox run — LLM-judged 🧠 | `tool_run_ai` | 20 | E-E-A-T, platform optimizer, PAA targeting… |
| Scheduled monitoring + answer tracking | — | Plan feature | Cadence + tracked-prompt count gated by tier |
| Traffic proof (GSC / GA4) | — | **Free** | Never meter the proof |

Principles: **the user buys outcomes (an audit, a benchmark, a report, a tool run) — never
"tool access", never per-fix microtransactions, never access to their own proof.** Charging
per auto-fix punishes the user at the exact moment the product delivers its core promise and
contradicts the "hired employee" narrative. Idempotency via ledger `refId` (= run id) exactly
like article generation. Every spend is declared in `CREDIT_COSTS` so UI price and enforced
price can't drift.

### Plan features (draft — mirror how weekly article caps work today)

| Feature | Indie | Startup | Scale | Enterprise |
|---|---|---|---|---|
| Agent audit cadence | Monthly | Weekly | Weekly | Custom |
| Tracked prompts (V5.5) | 5 | 15 | 50 | Custom |
| Answer-check cadence | Monthly | Weekly | Weekly | Custom |
| Auto-fixes / month | 20 | 100 | 500 | Custom |
| Competitors benchmarked | 1 | 3 | 10 | Custom |
| PDF reports | Credits | 1/mo included | Included | Included |
| Claudia autonomy | L0–L1 | L0–L2 | L0–L2 | L0–L2 |

This table must exist verbatim on the pricing page — "what do I get on plan X" needs a
one-glance answer.

---

## Claudia's visibility duties (the trust ramp)

The agent narrative stays "your content employee" — she just gets a second responsibility:
keeping the brand visible. (Her **writer half** — evidence-backed topic mining, the anti-slop
style engine, and the performance feedback loop — is specced separately in
[`../content-agent/README.md`](../content-agent/README.md); both halves share the GSC
connection, the daily job, and one digest.) Autonomy is **earned, per category, opt-in**:

- **Level 0 — Monitor (default):** scheduled audit + answer checks per plan cadence; findings
  land in the fix queue; digest email leads with the proof stack: "Your score moved 61 → 68.
  You appeared in 4 of 10 tracked AI answers (up from 2). Clicks +9% since baseline." Alert
  on score drops.
- **Level 1 — Propose:** she prepares the fixes (drafts the schema, the llms.txt, the meta
  rewrite) and queues them for one-click approval.
- **Level 2 — Auto-apply:** per-category toggles in settings (e.g. "she may update article
  meta/schema," "she may regenerate llms.txt"). Only `fix_capability: auto` categories can
  ever be Level 2. Everything she does is logged to Activity and reversible.

She never touches off-site surfaces and never promises to. Marketing promise: *"hire an
employee who keeps your brand visible"* — delivered as monitor → propose → auto-apply, and
because auto-fixes are plan-included (not per-fix), her doing her job never reads as a bill.

---

## Marketing claims (guardrail)

The market stats in `tools-catalog.md` ($850M→$7.3B, +527% YoY, 4.4× conversion, …) are
internal motivation. **Verify sourcing before any of them appear on a marketing surface** —
several circulate with weak provenance. Claims about the product itself must match the
autonomy reality: what's `auto` vs `artifact` vs `guided` — never imply off-site work.

---

## What is explicitly deferred

- Agency tier (white-label, CRM, proposals) — unchanged, V7.4, only if resellers show up.
- Our own on-site analytics/tracking snippet — GSC + GA4 (V6.6) cover proof; revisit only if
  connect rates are poor.
- Per-tool subscription add-ons, marketplace framing, seat-based pricing — no.
- Fully autonomous "zero-approval" mode — not until Level 2 has months of trust data.
- Answer-tracking extras (sentiment, more engines, per-market prompts) — after V5.5 proves
  demand.
