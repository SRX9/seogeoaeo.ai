# Visibility Suite — Build Plan & Progress Tracker

The phased, ticket-by-ticket build plan for the **SEO · AEO · GEO** measure→optimize→prove
layer catalogued in [`../tools-catalog.md`](../tools-catalog.md). Runs **parallel to** the
content engine plan in [`../v1-implementation-phases.md`](../v1-implementation-phases.md).

**North star:** help a **site owner make their own site more discoverable and get more
traffic** across SEO, AEO, and GEO. We don't just audit — we audit, then **auto-fix inside the
same app** that writes and republishes the content, then **prove it** with three layers of
proof: score delta (V6.3) → share of real AI answers (V5.5) → real traffic from GSC/GA4
(V6.6). See "The proof stack" in [`01-product-surface.md`](01-product-surface.md).

**Packaging (settled — see [`01-product-surface.md`](01-product-surface.md)):** the 35 tools
are the **engine**, Claudia the agent is the **face**, the fix queue is the **interface**, and
the proof stack is the **proof**. We never ship "35 tools in a sidebar" as the primary UX. The
**Toolbox** (every analyzer as a standalone credit-priced page) exists for technical users as a
secondary surface — same engine, different door.

> **Read first:** [`00-principles.md`](00-principles.md) — the porting rules, tech-stack mapping,
> data model, and orchestration that **every ticket assumes** — then
> [`01-product-surface.md`](01-product-surface.md) — packaging, navigation, fix queue, Toolbox,
> and pricing. Don't start a ticket without them.

---

## How to use this folder

- One **subfolder per phase** (`phase-v0-foundation` … `phase-v7-autofix`).
- Each phase folder has a **`README.md`** (phase goal + its ticket checklist) and **one `.md`
  file per ticket** (one tool = one ticket).
- **Each ticket is self-contained and AI-buildable**: goal, dependencies, exact files to create,
  ordered build steps, a **`📐 Build from`** block citing the exact `inspiration-code` source
  (file → function → weights), and a checkbox acceptance list.
- **Save progress by ticking the boxes** below and the `Status` line at the top of each ticket
  (`☐ Not started` → `◐ In progress` → `☑ Done`). Keep this index in sync — it's the dashboard.

**Ticket status legend:** ☐ Not started · ◐ In progress · ☑ Done · ⊘ Blocked

**Build the deterministic tickets first** (marked ⚙️) — they're cheap, reproducible, run entirely
in the Worker, and don't need the LLM. LLM-judged tickets are marked 🧠.

---

## Progress at a glance

- [x] **Phase V0 — Foundation** (4/4)
- [x] **Phase V1 — Quick wins** (5/5)
- [x] **Phase V2 — Scoring spine** (3/3)
- [x] **Phase V3 — Schema engine** (3/3)
- [x] **Phase V4 — Content & E-E-A-T** (5/5)
- [x] **Phase V5 — GEO depth** (5/5)
- [x] **Phase V6 — Reporting & proof** (6/6)
- [x] **Phase V7 — Auto-fix & agency** (4/4)
- [x] **Phase V8 — Product surface & monetization** (6/6)

**Total: 41/41 tickets**

---

## Phase V0 — [Foundation](phase-v0-foundation/README.md)
*The shared fetch/parse/persist/orchestrate engine every tool reuses.*

- [ ] ⚙️ [V0.1 — Page fetcher & HTML model](phase-v0-foundation/v0.1-page-fetcher.md)
- [ ] ⚙️ [V0.2 — robots.txt / sitemap / llms.txt fetchers + block splitter](phase-v0-foundation/v0.2-robots-sitemap-llms.md)
- [ ] ⚙️ [V0.3 — Audit data model & orchestration Workflow](phase-v0-foundation/v0.3-data-model-orchestration.md)
- [ ] ⚙️ [V0.4 — Business-type detector](phase-v0-foundation/v0.4-business-type-detector.md)

## Phase V1 — [Quick wins](phase-v1-quick-wins/README.md)
*Deterministic, high-value, cheap — powers the public "check your site" tool.*

- [ ] ⚙️ [V1.1 — AI crawler access analyzer](phase-v1-quick-wins/v1.1-crawler-access.md)
- [ ] ⚙️ [V1.2 — Content Signals checker](phase-v1-quick-wins/v1.2-content-signals.md)
- [ ] ⚙️ [V1.3 — llms.txt analyzer & generator](phase-v1-quick-wins/v1.3-llms-txt.md)
- [ ] ⚙️ [V1.4 — Meta tags & Open Graph auditor](phase-v1-quick-wins/v1.4-meta-audit.md)
- [ ] ⚙️ [V1.5 — 60-second quick snapshot](phase-v1-quick-wins/v1.5-quick-snapshot.md)

## Phase V2 — [Scoring spine](phase-v2-scoring-spine/README.md)
*The reproducible core IP plus the hero composite score.*

- [x] ⚙️ [V2.1 — AI citability / passage scorer (flagship)](phase-v2-scoring-spine/v2.1-citability-scorer.md)
- [x] ⚙️🧠 [V2.2 — Technical SEO auditor + SSR + CWV](phase-v2-scoring-spine/v2.2-technical-auditor.md)
- [x] ⚙️ [V2.3 — Unified audit + composite score](phase-v2-scoring-spine/v2.3-unified-audit.md)

## Phase V3 — [Schema engine](phase-v3-schema-engine/README.md)
*Detect → validate → generate copy-paste JSON-LD.*

- [x] ⚙️🧠 [V3.1 — Schema detector & validator](phase-v3-schema-engine/v3.1-schema-detector.md)
- [x] ⚙️ [V3.2 — Schema score & sameAs auditor](phase-v3-schema-engine/v3.2-schema-score-sameas.md)
- [x] 🧠 [V3.3 — JSON-LD generator (FAQ/Speakable)](phase-v3-schema-engine/v3.3-jsonld-generator.md)

## Phase V4 — [Content & E-E-A-T](phase-v4-content-eeat/README.md)
*The bridge to our writer; becomes live editor signals in V7.*

- [x] 🧠 [V4.1 — Content quality & E-E-A-T analyzer](phase-v4-content-eeat/v4.1-eeat-analyzer.md)
- [x] ⚙️ [V4.2 — Readability & content-depth analyzer](phase-v4-content-eeat/v4.2-readability.md)
- [x] 🧠 [V4.3 — AI-generated-content quality detector](phase-v4-content-eeat/v4.3-ai-content-detector.md)
- [x] ⚙️🧠 [V4.4 — Internal linking & topical-authority mapper](phase-v4-content-eeat/v4.4-internal-linking.md)
- [x] ⚙️ [V4.5 — Content freshness tracker](phase-v4-content-eeat/v4.5-freshness.md)

## Phase V5 — [GEO depth](phase-v5-geo-depth/README.md)
*The off-site & platform differentiators competitors don't quantify.*

- [x] ⚙️🧠 [V5.1 — Brand mention / entity authority scanner](phase-v5-geo-depth/v5.1-brand-scanner.md)
- [x] 🧠 [V5.2 — Platform-specific optimizer (5 engines)](phase-v5-geo-depth/v5.2-platform-optimizer.md)
- [x] ⚙️ [V5.3 — Agent-readiness signals](phase-v5-geo-depth/v5.3-agent-readiness.md)
- [x] 🧠 [V5.4 — Question / "People Also Ask" targeting](phase-v5-geo-depth/v5.4-paa-targeting.md)
- [x] 🧠 [V5.5 — AI answer tracking (share-of-answer)](phase-v5-geo-depth/v5.5-ai-answer-tracking.md) — *independent of V5.1–V5.4; pull forward (see build order)*

## Phase V6 — [Reporting & proof](phase-v6-reporting/README.md)
*Turn scores into deliverables and prove the gain.*

- [ ] ⚙️ [V6.1 — Client report generator (in-app + Markdown)](phase-v6-reporting/v6.1-client-report.md)
- [ ] ⚙️ [V6.2 — PDF report generator](phase-v6-reporting/v6.2-pdf-report.md)
- [ ] ⚙️ [V6.3 — Monthly delta / progress tracker](phase-v6-reporting/v6.3-delta-tracker.md)
- [ ] ⚙️ [V6.4 — Competitor AI-visibility benchmarking](phase-v6-reporting/v6.4-competitor-benchmark.md) — *lite mode after V2.3, full grid after V5*
- [ ] 🧠 [V6.5 — Answer-block & featured-snippet optimizer](phase-v6-reporting/v6.5-answer-block-optimizer.md)
- [ ] ⚙️ [V6.6 — Traffic proof (Search Console + AI referrals)](phase-v6-reporting/v6.6-traffic-proof.md) — *independent; connect early so history accrues*

## Phase V7 — [Auto-fix & agency](phase-v7-autofix/README.md)
*Our moat (close the loop) and the optional premium upsell.*

- [ ] 🧠 [V7.1 — Wire analyzers into the article editor](phase-v7-autofix/v7.1-editor-integration.md)
- [ ] ⚙️ [V7.2 — Auto-apply fixes](phase-v7-autofix/v7.2-auto-apply-fixes.md)
- [ ] ⚙️ [V7.3 — Scheduled re-audits & alerts](phase-v7-autofix/v7.3-scheduled-reaudits.md)
- [ ] ⚙️ [V7.4 — Optional agency tier](phase-v7-autofix/v7.4-agency-tier.md)

## Phase V8 — [Product surface & monetization](phase-v8-surface/README.md)
*The packaging layer: score page, fix queue, Toolbox, metering, agent. Interleaves with the
engine phases — see the build order below and the phase README's "When to build what".*

- [x] ⚙️ [V8.1 — Visibility dashboard page](phase-v8-surface/v8.1-visibility-dashboard.md)
- [x] ⚙️ [V8.2 — Fix queue](phase-v8-surface/v8.2-fix-queue.md)
- [x] ⚙️ [V8.3 — Toolbox (standalone tool pages)](phase-v8-surface/v8.3-toolbox.md)
- [x] ⚙️ [V8.4 — Credit metering for visibility jobs](phase-v8-surface/v8.4-credit-metering.md)
- [x] 🧠 [V8.5 — Claudia visibility agent](phase-v8-surface/v8.5-claudia-visibility-agent.md)
- [x] ⚙️ [V8.6 — Growth funnel (public tools → signup → first audit)](phase-v8-surface/v8.6-growth-funnel.md)

---

## Recommended build order

The ordering principle: **the demo moment (V5.5) and the proof moments (V6.3, V6.4-lite,
V6.6) come right after the score exists** — they're what sells and retains, and none of them
depend on the V3–V5 engine depth. Depth work follows.

1. **V0** foundation, then **V8.4** metering (nothing user-triggerable ships unmetered).
2. **V1** quick wins → ship the **public checker + free tool pages** early (V8.6 funnel work
   starts here — the free tools are the marketing).
3. **V2** scoring spine, then immediately **V8.1** score page + **V8.2** fix queue — the score
   and the queue go live the moment the composite exists.
4. **Proof sprint (pull-forward):**
   - **V6.3** delta tracker — nearly free once audits are versioned; the score is never
     shown without its delta.
   - **V5.5** AI answer tracking — independent of the audit engine; the demo moment and
     proof layer 2.
   - **V6.6** traffic proof — connect GSC/GA4 as early as possible so history accrues.
   - **V6.4 (lite)** competitor benchmark — technical + citability subset vs one competitor;
     the full grid lands after V5.
   - **V8.6** growth funnel — snapshot→signup carry-over, first audit free, badge.
5. **V3** schema engine, then **V8.3** Toolbox (~9 tools ready — enough to look like a product).
   From here on, every new analyzer also registers in the Toolbox as part of its ticket.
6. **V4** content/E-E-A-T (feeds the writer, unlocks V7.1).
7. **V5** GEO depth (the differentiators; completes the V6.4 grid).
8. **V6** remaining reporting (V6.1/V6.2 reports, V6.5 answer blocks).
9. **V7** auto-fix loop (moat — including applying fixes through publishing connectors),
   then **V8.5** the agent ramp (monitor → propose → auto-apply); agency tier (V7.4) only if
   pursuing resellers.

Within a phase, do ⚙️ deterministic tickets before 🧠 LLM tickets. All engine tickets must
honor the two surface contracts (rules 5–6 in `00-principles.md`): dual-mode `run()`
entry-points and no findings without a `fix_capability`/`fix_payload` when mechanically fixable.
