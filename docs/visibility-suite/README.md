# Visibility Suite — Build Plan & Progress Tracker

The phased, ticket-by-ticket build plan for the **SEO · AEO · GEO** measure→optimize→prove
layer catalogued in [`../tools-catalog.md`](../tools-catalog.md). Runs **parallel to** the
content engine plan in [`../v1-implementation-phases.md`](../v1-implementation-phases.md).

**North star:** help a **site owner make their own site more discoverable and get more
traffic** across SEO, AEO, and GEO. We don't just audit — we audit, then **auto-fix inside the
same app** that writes and republishes the content.

> **Read first:** [`00-principles.md`](00-principles.md) — the porting rules, tech-stack mapping,
> data model, and orchestration that **every ticket assumes**. Don't start a ticket without it.

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

- [ ] **Phase V0 — Foundation** (0/4)
- [ ] **Phase V1 — Quick wins** (0/5)
- [ ] **Phase V2 — Scoring spine** (0/3)
- [ ] **Phase V3 — Schema engine** (0/3)
- [ ] **Phase V4 — Content & E-E-A-T** (0/5)
- [ ] **Phase V5 — GEO depth** (0/4)
- [ ] **Phase V6 — Reporting & proof** (0/5)
- [ ] **Phase V7 — Auto-fix & agency** (0/4)

**Total: 0/33 tickets**

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

- [ ] ⚙️ [V2.1 — AI citability / passage scorer (flagship)](phase-v2-scoring-spine/v2.1-citability-scorer.md)
- [ ] ⚙️🧠 [V2.2 — Technical SEO auditor + SSR + CWV](phase-v2-scoring-spine/v2.2-technical-auditor.md)
- [ ] ⚙️ [V2.3 — Unified audit + composite score](phase-v2-scoring-spine/v2.3-unified-audit.md)

## Phase V3 — [Schema engine](phase-v3-schema-engine/README.md)
*Detect → validate → generate copy-paste JSON-LD.*

- [ ] ⚙️🧠 [V3.1 — Schema detector & validator](phase-v3-schema-engine/v3.1-schema-detector.md)
- [ ] ⚙️ [V3.2 — Schema score & sameAs auditor](phase-v3-schema-engine/v3.2-schema-score-sameas.md)
- [ ] 🧠 [V3.3 — JSON-LD generator (FAQ/Speakable)](phase-v3-schema-engine/v3.3-jsonld-generator.md)

## Phase V4 — [Content & E-E-A-T](phase-v4-content-eeat/README.md)
*The bridge to our writer; becomes live editor signals in V7.*

- [ ] 🧠 [V4.1 — Content quality & E-E-A-T analyzer](phase-v4-content-eeat/v4.1-eeat-analyzer.md)
- [ ] ⚙️ [V4.2 — Readability & content-depth analyzer](phase-v4-content-eeat/v4.2-readability.md)
- [ ] 🧠 [V4.3 — AI-generated-content quality detector](phase-v4-content-eeat/v4.3-ai-content-detector.md)
- [ ] ⚙️🧠 [V4.4 — Internal linking & topical-authority mapper](phase-v4-content-eeat/v4.4-internal-linking.md)
- [ ] ⚙️ [V4.5 — Content freshness tracker](phase-v4-content-eeat/v4.5-freshness.md)

## Phase V5 — [GEO depth](phase-v5-geo-depth/README.md)
*The off-site & platform differentiators competitors don't quantify.*

- [ ] ⚙️🧠 [V5.1 — Brand mention / entity authority scanner](phase-v5-geo-depth/v5.1-brand-scanner.md)
- [ ] 🧠 [V5.2 — Platform-specific optimizer (5 engines)](phase-v5-geo-depth/v5.2-platform-optimizer.md)
- [ ] ⚙️ [V5.3 — Agent-readiness signals](phase-v5-geo-depth/v5.3-agent-readiness.md)
- [ ] 🧠 [V5.4 — Question / "People Also Ask" targeting](phase-v5-geo-depth/v5.4-paa-targeting.md)

## Phase V6 — [Reporting & proof](phase-v6-reporting/README.md)
*Turn scores into deliverables and prove the gain.*

- [ ] ⚙️ [V6.1 — Client report generator (in-app + Markdown)](phase-v6-reporting/v6.1-client-report.md)
- [ ] ⚙️ [V6.2 — PDF report generator](phase-v6-reporting/v6.2-pdf-report.md)
- [ ] ⚙️ [V6.3 — Monthly delta / progress tracker](phase-v6-reporting/v6.3-delta-tracker.md)
- [ ] ⚙️ [V6.4 — Competitor AI-visibility benchmarking](phase-v6-reporting/v6.4-competitor-benchmark.md)
- [ ] 🧠 [V6.5 — Answer-block & featured-snippet optimizer](phase-v6-reporting/v6.5-answer-block-optimizer.md)

## Phase V7 — [Auto-fix & agency](phase-v7-autofix/README.md)
*Our moat (close the loop) and the optional premium upsell.*

- [ ] 🧠 [V7.1 — Wire analyzers into the article editor](phase-v7-autofix/v7.1-editor-integration.md)
- [ ] ⚙️ [V7.2 — Auto-apply fixes](phase-v7-autofix/v7.2-auto-apply-fixes.md)
- [ ] ⚙️ [V7.3 — Scheduled re-audits & alerts](phase-v7-autofix/v7.3-scheduled-reaudits.md)
- [ ] ⚙️ [V7.4 — Optional agency tier](phase-v7-autofix/v7.4-agency-tier.md)

---

## Recommended build order

1. **V0** → **V1** (ship the public checker early — marketing + lead-gen).
2. **V2** scoring spine (core IP + hero score).
3. **V3** schema → **V4** content/E-E-A-T (these feed the writer and unlock V7.1).
4. **V5** GEO depth (the differentiators).
5. **V6** reporting + delta (prove the gain, justify the subscription).
6. **V7** auto-fix loop (moat); agency tier only if pursuing resellers.

Within a phase, do ⚙️ deterministic tickets before 🧠 LLM tickets.
