# SEO · AEO · GEO — Tools & Features Catalog

> A product catalog of every tool/feature we can ship in the suite, distilled from
> `inspiration-code/` (a full GEO audit toolkit) and adapted to our product. Each
> entry says **what it does**, **why it's good**, and **which pillar it belongs to**.
>
> Our existing app already does the *creation* half (research → write SEO articles →
> publish). This catalog is the *visibility & optimization* half — the layer that
> **measures**, **optimizes**, and **proves** how findable a site is across classic
> search, answer engines, and AI assistants. Together they make the "all-in-one
> SEO·AEO·GEO AI suite."

> **🎯 North Star:** help a **site owner make their own site more discoverable and get
> more traffic** across SEO, AEO, and GEO. This is a **self-serve product for the owner
> of the site**, not an agency console. Every tool is judged by one question: *does it
> make this user's site easier to find and bring them more traffic?* The agency/reseller
> tools inherited from `inspiration-code` (CRM, proposals, prospect pipeline) are an
> **optional premium tier — secondary to the core loop**, not the point of the product.
>
> The core loop we're building toward: **measure visibility → fix it (ideally auto, inside
> the app) → re-measure → show the traffic gain.**
>
> **Packaging (settled):** these tools are the *engine*, not the sidebar. The user-facing
> product is the score + fix queue + Claudia the agent, with a secondary **Toolbox** of
> standalone credit-priced tool pages for technical users. See
> [`visibility-suite/01-product-surface.md`](visibility-suite/01-product-surface.md).

---

## 1. First, the three pillars (so the categories make sense)

| Pillar | Full name | Optimizes for… | Win condition | Signals that matter most |
|---|---|---|---|---|
| **SEO** | Search Engine Optimization | Classic search engines (Google/Bing **blue links**) | Rank in the 10 organic results | Technical health, crawl/index, Core Web Vitals, on-page meta, content depth, structured data for rich results |
| **AEO** | Answer Engine Optimization | **Answer boxes** — featured snippets, Google AI Overviews, "People Also Ask," voice assistants | Be *the* extracted answer | Question-based headings, short self-contained answers, FAQ/Q&A & speakable schema, passage citability |
| **GEO** | Generative Engine Optimization | **AI assistants** — ChatGPT, Claude, Perplexity, Gemini, Copilot | Be cited/recommended by the LLM | Entity & brand authority, AI-crawler access, llms.txt, Content Signals, off-site mentions (Wikipedia/Reddit/YouTube), agent-readiness |

**The overlap is real and intentional.** Schema helps all three. A citable passage wins
both an answer box (AEO) and an LLM citation (GEO). So each tool below has a **Primary**
pillar plus **Also** tags where it carries over.

**Why this market is worth building for** (from the inspiration's research):

- GEO services market ~**$850M in 2025**, projected **$7.3B by 2031** (34% CAGR).
- AI-referred traffic grew **+527% YoY**; it converts **~4.4×** better than organic.
- Gartner expects classic search traffic to **drop ~50% by 2028**.
- Brand mentions correlate **~3× stronger** with AI citations than backlinks do.
- Only **~23%** of marketers invest in GEO today, and **<5%** of sites have an `llms.txt` → cheap early wins.

> ⚠️ These numbers are **internal motivation only**. Several circulate with weak provenance —
> verify sourcing before quoting any of them on a marketing surface
> (see `visibility-suite/01-product-surface.md` → "Marketing claims").

---

## 2. Master list at a glance

Legend — **Pillar:** 🔵 SEO · 🟣 AEO · 🟢 GEO · ⚪ Cross-cutting/Business
· **Source:** ⭐ = directly in `inspiration-code`, ➕ = natural extension to round out the suite.

| # | Tool / Feature | Primary | Also | Source |
|---|---|---|---|---|
| **Core audit & scoring** | | | | |
| 1 | Unified Visibility Audit (0–100 composite score) | ⚪ | 🔵🟣🟢 | ⭐ |
| 2 | 60-Second Quick Snapshot | ⚪ | 🔵🟣🟢 | ⭐ |
| 3 | Business-Type Detector | ⚪ | — | ⭐ |
| **SEO** | | | | |
| 4 | Technical SEO Auditor | 🔵 | 🟢 | ⭐ |
| 5 | Server-Side Rendering / JS-Dependency Detector | 🔵 | 🟢 | ⭐ |
| 6 | Core Web Vitals Risk Analyzer | 🔵 | — | ⭐ |
| 7 | Robots.txt & XML Sitemap Validator | 🔵 | 🟢 | ⭐ |
| 8 | Meta Tags & Open Graph Auditor | 🔵 | 🟣 | ⭐ |
| 9 | Structured Data / Schema Detector + Generator | 🔵 | 🟣🟢 | ⭐ |
| 10 | Content Quality & E-E-A-T Analyzer | 🔵 | 🟣 | ⭐ |
| 11 | Readability & Content-Depth Analyzer | 🔵 | 🟣 | ⭐ |
| 12 | Internal Linking & Topical-Authority Mapper | 🔵 | 🟢 | ⭐ |
| 13 | Content Freshness Tracker | 🔵 | — | ⭐ |
| **AEO** | | | | |
| 14 | AI Citability / Passage Scorer | 🟣 | 🟢 | ⭐ |
| 15 | Answer-Block & Featured-Snippet Optimizer | 🟣 | 🔵 | ⭐/➕ |
| 16 | FAQ / Q&A & Speakable Schema Generator | 🟣 | 🔵 | ⭐ |
| 17 | Google AI Overviews Readiness | 🟣 | 🟢 | ⭐ |
| 18 | Question & "People Also Ask" Targeting | 🟣 | 🔵 | ➕ |
| 19 | AI-Generated-Content Quality Detector | 🟣 | 🔵 | ⭐ |
| **GEO** | | | | |
| 20 | AI Crawler Access Analyzer (14+ bots, 3 tiers) | 🟢 | 🔵 | ⭐ |
| 21 | llms.txt Analyzer & Generator | 🟢 | — | ⭐ |
| 22 | Content Signals (AI-preference) Checker | 🟢 | — | ⭐ |
| 23 | Brand Mention / Entity Authority Scanner | 🟢 | — | ⭐ |
| 24 | Platform-Specific Optimizer (5 AI engines) | 🟢 | 🟣 | ⭐ |
| 25 | Agent-Readiness Signals (Markdown + Link headers) | 🟢 | — | ⭐ |
| 26 | Entity & `sameAs` Consistency Auditor | 🟢 | 🔵 | ⭐ |
| 27 | Competitor AI-Visibility Benchmarking | 🟢 | 🔵🟣 | ⭐/➕ |
| 34 | AI Answer Tracking (share-of-answer) | 🟢 | 🟣 | ➕ |
| **Reporting · monitoring · business** | | | | |
| 28 | Client Report Generator (Markdown) | ⚪ | — | ⭐ |
| 29 | PDF Report Generator (charts & gauges) | ⚪ | — | ⭐ |
| 30 | White-Label Branding | ⚪ | — | ⭐ |
| 31 | Monthly Delta / Progress Tracker | ⚪ | — | ⭐ |
| 32 | Prospect CRM + Web Dashboard | ⚪ | — | ⭐ |
| 33 | Proposal Generator | ⚪ | — | ⭐ |
| 35 | Traffic Proof (Search Console + AI referrals) | ⚪ | — | ➕ |

---

## 3. Core audit & scoring (the spine)

### 1. Unified Visibility Audit — `⚪ Cross-cutting (SEO+AEO+GEO)`
**What it does:** One command audits a whole site and returns a single **0–100 score**
plus six weighted sub-scores (Citability 25% · Brand Authority 20% · Content/E-E-A-T 20%
· Technical 15% · Schema 10% · Platform 10%). Runs five analyzers in parallel, then
synthesizes a severity-ranked issue list (Critical/High/Medium/Low) and a 30-day action plan.
**Why it's good:** It's the hero feature — one number an owner instantly understands, with a
prioritized to-do list underneath. Everything else plugs into it. Becomes the headline metric
on the dashboard and the thing we can show improving month over month.

### 2. 60-Second Quick Snapshot — `⚪ Cross-cutting`
**What it does:** Lightweight pass (crawler access, llms.txt presence, homepage schema, a
rough citability read) that returns an approximate score and the top gaps — no full crawl.
**Why it's good:** Perfect for instant "check your site" lead-gen on the marketing page and
for fast qualification before committing to a full audit. Low cost, high conversion.

### 3. Business-Type Detector — `⚪ Helper`
**What it does:** Classifies a site as SaaS / Local / E-commerce / Publisher / Agency from
homepage signals, then tailors every recommendation (e.g., Local → LocalBusiness schema +
Google Business Profile; SaaS → SoftwareApplication schema + comparison pages).
**Why it's good:** Makes advice feel hand-written instead of generic. Drives schema choices,
report tone, and which checks matter most. Invisible plumbing that lifts the whole product's quality.

---

## 4. SEO tools (classic search)

### 4. Technical SEO Auditor — `🔵 SEO · also 🟢 GEO`
**What it does:** Eight-category technical audit — crawlability, indexability, security headers,
URL structure, mobile, Core Web Vitals risk, page speed, and SSR — each scored with Pass/Warn/Fail.
**Why it's good:** The foundation. No amount of content or AI optimization matters if the page
can't be crawled, indexed, or loaded. Produces a clean developer-facing remediation checklist.

### 5. Server-Side Rendering / JS-Dependency Detector — `🔵 SEO · also 🟢 GEO`
**What it does:** Compares raw HTML to the rendered DOM and flags content that only appears
after JavaScript runs. Detects the framework (Next.js/Nuxt/React SPA/etc.) and rates severity.
**Why it's good:** This is the single highest-leverage GEO check. **AI crawlers don't execute
JavaScript** — a client-rendered SPA is invisible to GPTBot/ClaudeBot/PerplexityBot no matter
how good the content is. Catching this is often worth more than everything else combined.

### 6. Core Web Vitals Risk Analyzer — `🔵 SEO`
**What it does:** Estimates LCP / INP / CLS risk from static HTML (lazy-loading, render-blocking
resources, missing image dimensions, font-display, heavy synchronous JS). Uses 2026 thresholds
(INP, not the retired FID).
**Why it's good:** Speed is a confirmed ranking factor and a UX/conversion lever. Gives an
instant risk read without needing field data, and flags exactly what to fix.

### 7. Robots.txt & XML Sitemap Validator — `🔵 SEO · also 🟢 GEO`
**What it does:** Parses `robots.txt` for syntax errors, accidental blocks, crawl-delay, and
sitemap references; validates sitemap formatting, `<lastmod>` accuracy, and coverage.
**Why it's good:** A one-character robots.txt mistake can deindex a whole site. Cheap to check,
catastrophic to miss — and it's the same file the GEO crawler/Content-Signals checks read.

### 8. Meta Tags & Open Graph Auditor — `🔵 SEO · also 🟣 AEO`
**What it does:** Audits title, description, canonical, viewport, `lang`, hreflang, robots
directives, plus Open Graph and Twitter Card tags — checking presence *and* quality.
**Why it's good:** Controls how the page appears in search snippets and social/AI previews. A
title that says "Home" is effectively missing. Fast, universal wins on almost every site.

### 9. Structured Data / Schema Detector + Generator — `🔵 SEO · also 🟣 AEO · 🟢 GEO`
**What it does:** Extracts all JSON-LD/Microdata/RDFa, validates types & required properties,
audits `sameAs` links, flags deprecated schemas (HowTo, restricted FAQPage) and JS-injected
schema, then **generates ready-to-paste JSON-LD** from a template library (Organization,
LocalBusiness, Article+Author, Product, SoftwareApplication, WebSite+SearchAction).
**Why it's good:** The triple-threat tool. Rich results (SEO) + speakable/FAQ answers (AEO) +
machine-readable entity identity via `sameAs` (GEO). Generation turns a finding into a copy-paste fix.

### 10. Content Quality & E-E-A-T Analyzer — `🔵 SEO · also 🟣 AEO`
**What it does:** Scores Experience, Expertise, Authoritativeness, Trustworthiness (0–25 each)
from observable signals — original data, author credentials/bio, citations, HTTPS, contact info,
editorial standards, sourcing — plus a topical-authority modifier.
**Why it's good:** E-E-A-T is how both Google *and* LLMs decide whom to trust. Translates a
fuzzy quality concept into a concrete, fixable checklist (add author bios, cite sources, show dates).

### 11. Readability & Content-Depth Analyzer — `🔵 SEO · also 🟣 AEO`
**What it does:** Measures word count vs. type benchmarks, approximate Flesch readability,
paragraph length ("wall of text" flags), and heading hierarchy (one H1, no skipped levels).
**Why it's good:** Clean, well-structured prose ranks better and is far easier for answer
engines to extract. Directly feeds our content generator's editing prompts.

### 12. Internal Linking & Topical-Authority Mapper — `🔵 SEO · also 🟢 GEO`
**What it does:** Assesses content breadth, internal-link depth, hub-and-spoke/pillar-cluster
structure, and identifies missing subtopics (content gaps) for a topic.
**Why it's good:** Topical authority is how a site becomes "the" source on a subject — for
rankings and for being the entity an LLM names. Output is a ready-made content-gap backlog
(which feeds straight into our topic-research engine).

### 13. Content Freshness Tracker — `🔵 SEO`
**What it does:** Detects publish/updated dates, flags stale content on time-sensitive
(YMYL) topics, and surfaces "update this" candidates.
**Why it's good:** Freshness is a ranking and trust signal; refreshing existing pages is the
highest-ROI content work there is. Pairs naturally with our scheduler to auto-suggest refreshes.

---

## 5. AEO tools (answer engines & snippets)

### 14. AI Citability / Passage Scorer — `🟣 AEO · also 🟢 GEO`
**What it does:** Splits a page into heading-bounded blocks and scores each 0–100 across five
dimensions — Answer-Block Quality (30%), Self-Containment (25%), Structural Readability (20%),
Statistical Density (15%), Uniqueness (10%). Flags the strongest/weakest blocks and writes
rewrite suggestions (including a suggested opening sentence). Optimal cited passages are
**134–167 words, answer-first, fact-rich, self-contained**. *(Deterministic — same input, same score.)*
**Why it's good:** This is the precise, repeatable engine of both AEO and GEO. It tells a writer
exactly which paragraph will get pulled into an answer box or an LLM citation — and how to fix
the ones that won't. Bolt it directly onto our article editor as a live score.

### 15. Answer-Block & Featured-Snippet Optimizer — `🟣 AEO · also 🔵 SEO`
**What it does:** Restructures a target section into the formats answer engines extract: a 40–60
word direct definition/answer up top, then a list/table/steps. Detects when a query deserves a
paragraph vs. list vs. table snippet.
**Why it's good:** Featured snippets and AI Overviews quote a specific shape of content. This
turns "good content" into "extractable content," capturing position-zero traffic.

### 16. FAQ / Q&A & Speakable Schema Generator — `🟣 AEO · also 🔵 SEO`
**What it does:** Generates `FAQPage`/`QAPage` and `speakable` JSON-LD from page content so
answers are machine-readable for assistants and voice.
**Why it's good:** Explicitly hands answer engines and voice assistants the Q→A pairs. Low effort,
directly targets answer surfaces. (Respects current eligibility limits, e.g. FAQ rich-result restrictions.)

### 17. Google AI Overviews Readiness — `🟣 AEO · also 🟢 GEO`
**What it does:** Scores a page against the AIO checklist — top-10 organic presence, question-based
headings, direct-answer paragraphs, tables, FAQ sections, attributed statistics, author bylines, dates.
**Why it's good:** AI Overviews already reach 1.5B users/month and are eating click-through. This
maps the exact gaps between "ranking" and "being summarized at the top."

### 18. Question & "People Also Ask" Targeting — `🟣 AEO · also 🔵 SEO` ➕
**What it does:** Mines the real questions users ask (PAA, autocomplete, forum threads) for a
topic and maps each to a heading + answer block the page should contain.
**Why it's good:** Answer engines are literally answering questions — so the unit of optimization
is the question. Feeds our research backlog and gives every article a built-in AEO outline.

### 19. AI-Generated-Content Quality Detector — `🟣 AEO · also 🔵 SEO`
**What it does:** Flags low-effort AI patterns (generic phrasing, no specifics, hedging overload,
"perfect structure / empty substance," no authorial voice) and rates likelihood human-vs-AI.
**Why it's good:** Thin AI content gets ignored by search *and* assistants. As an AI writer
ourselves, this is our built-in quality gate — we grade and lift our own output before publishing.

---

## 6. GEO tools (AI assistants)

### 20. AI Crawler Access Analyzer — `🟢 GEO · also 🔵 SEO`
**What it does:** Maps `robots.txt`, meta-robots, and `X-Robots-Tag` against **14+ AI crawlers**
in three tiers — Tier 1 search (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot),
Tier 2 ecosystem (Google-Extended, Applebot-Extended, Amazonbot, Meta), Tier 3 training-only
(CCBot, Bytespider, etc.). Outputs an AI-visibility score and a ready-to-paste robots.txt.
**Why it's good:** Many sites accidentally block the exact bots that power AI search. This is
often a five-minute fix that unlocks all GEO visibility — a classic quick win.

### 21. llms.txt Analyzer & Generator — `🟢 GEO`
**What it does:** Validates an existing `/llms.txt` against the spec (H1 title, blockquote
description, H2 sections, absolute URLs, key facts) or **crawls the site and generates one**,
prioritizing the pages and facts AI should know.
**Why it's good:** `llms.txt` is the emerging "sitemap for AI." With <5% adoption, generating a
good one is a cheap, visible differentiator we can produce in one click.

### 22. Content Signals (AI-preference) Checker — `🟢 GEO`
**What it does:** Scans `robots.txt` for the IETF `Content-Signal:` directive
(`ai-train`, `search`, `ai-retrieval`, `ai-personalization`), parses and explains it in plain
English, validates keys/values, and recommends one if absent. (Reuses the existing robots.txt fetch — zero extra requests.)
**Why it's good:** Lets a site declare *how* AI may use its content (separate from crawler
access). It's brand-new and almost nobody has it — easy thought-leadership win, non-penalizing.

### 23. Brand Mention / Entity Authority Scanner — `🟢 GEO`
**What it does:** Checks brand presence where LLMs learn entities — Wikipedia/Wikidata (via the
Wikipedia API directly, to avoid false negatives), Reddit (volume + sentiment), YouTube, LinkedIn,
plus G2/Trustpilot/Capterra, Quora, Stack Overflow, GitHub, HN, press — and returns a weighted
Brand Authority Score with prioritized actions.
**Why it's good:** Brand mentions correlate ~3× stronger with AI citations than backlinks
(YouTube ~0.737 vs domain rating ~0.266 in a 75k-brand study). This is the off-site GEO lever
nobody else quantifies — and it explains *why* a technically-perfect site still isn't recommended.

### 24. Platform-Specific Optimizer — `🟢 GEO · also 🟣 AEO`
**What it does:** Separate scored checklists for **five engines** — Google AI Overviews, ChatGPT
Web Search, Perplexity, Gemini, Bing Copilot — because each sources differently (ChatGPT→Wikipedia
entity; Perplexity→Reddit + original research; Gemini→YouTube + Knowledge Panel; Copilot→IndexNow +
Bing Webmaster). Returns per-platform gaps and a cross-platform plan.
**Why it's good:** Only ~11% of domains are cited by both ChatGPT and Google AIO for the same
query. Treating each engine separately is the difference between "optimized for AI" and
"optimized for *the AI my customers actually use*."

### 25. Agent-Readiness Signals — `🟢 GEO` (non-scoring, forward-looking)
**What it does:** Two emerging checks: (a) **Markdown content negotiation** — `Accept: text/markdown`
returns clean Markdown for agents; (b) **RFC 8288 `Link:` headers** — advertises `api-catalog`,
`service-doc`, `mcp-server-card` for machine discovery. Surfaced as bonuses/recommendations, never penalties.
**Why it's good:** Positions the suite at the frontier of the agentic web (MCP, AI agents
consuming sites directly). Great differentiator and thought-leadership content; cheap because it
reuses existing fetches.

### 26. Entity & `sameAs` Consistency Auditor — `🟢 GEO · also 🔵 SEO`
**What it does:** Audits the `sameAs` graph across a priority list of ~14 platforms (Wikipedia,
Wikidata, LinkedIn, YouTube, X, GitHub, Crunchbase, G2…) and checks name/identity consistency
between schema, site, and off-site profiles.
**Why it's good:** Consistent, well-linked entity identity is how an LLM knows two mentions are
the *same* brand and decides to trust it. Bridges the schema tool and the brand scanner into one
"are you a recognized entity?" verdict.

### 27. Competitor AI-Visibility Benchmarking — `🟢 GEO · also 🔵 SEO · 🟣 AEO` ➕
**What it does:** Runs the audit/brand/citability stack against named competitors and produces a
side-by-side gap table (who owns which platform, who has the Wikipedia entity, who's more citable).
**Why it's good:** Turns an abstract score into "you're behind competitor X on Perplexity and
Wikipedia — here's how to catch up." The most persuasive thing in any sales or strategy conversation.

### 34. AI Answer Tracking (share-of-answer) — `🟢 GEO · also 🟣 AEO` ➕
**What it does:** Maintains a set of tracked prompts ("best X for Y") and, on the plan's cadence,
asks the real engines — ChatGPT (web search), Perplexity, Gemini — recording whether the brand
and its competitors are mentioned or cited in each answer. Output is **answer share per engine
over time**, plus a prompt × engine grid and fix-queue findings for the misses.
**Why it's good:** Everything else in this catalog is self-graded; this measures the actual
outcome. "You appear in 4 of 10 answers, your competitor in 8" is the demo moment that sells the
whole suite, and its week-over-week movement is proof layer 2 (see `01-product-surface.md`).

---

## 7. Reporting, monitoring & business tools

> **Positioning:** #28–#31 (reports + progress tracking) directly serve the north star —
> they *show the owner their site improving and the traffic it's earning*, so keep them.
> #32–#33 (CRM + proposals) are **agency-tier extras**, not part of the core site-owner
> loop; ship them only as an optional premium plan, after the optimization tools land.

### 28. Client Report Generator (Markdown) — `⚪`
**What it does:** Aggregates every audit into one 3,000–6,000-word, business-language deliverable —
executive summary, score dashboard, per-platform visibility, crawler table, brand authority,
citability top/bottom pages, technical & schema health, prioritized plan, glossary, and conservative
traffic/revenue impact estimates.
**Why it's good:** Translates technical findings into owner/marketer language with dollar framing.
This *is* the sellable artifact — the thing a customer or agency hands to a stakeholder.

### 29. PDF Report Generator — `⚪`
**What it does:** Renders the report as a polished PDF — cover with score gauge, color-coded score
tables, platform-readiness bar charts, severity-tagged findings, action plan, methodology appendix.
**Why it's good:** A branded PDF feels premium and is emailable as-is. Higher perceived value =
easier upsell; the deliverable customers expect to pay for.

### 30. White-Label Branding — `⚪`
**What it does:** A single brand config (name, contact, colors, logo) rebrands every report —
no code edits.
**Why it's good:** Unlocks the agency/reseller segment (the highest-value buyers, charging
$2K–$12K/mo). One config field turns our tool into *their* product — a natural premium plan tier.

### 31. Monthly Delta / Progress Tracker — `⚪`
**What it does:** Compares a baseline audit to the current one, shows score deltas with trend
arrows across every category/platform, tracks action-item completion, and plots a 6-month trajectory.
**Why it's good:** Proof of progress is what justifies a recurring subscription/retainer. Converts
a one-off audit into ongoing value and is the natural payload for our scheduled (cron) jobs.

### 32. Prospect CRM + Web Dashboard — `⚪`
**What it does:** Lightweight pipeline (lead → qualified → proposal → won/lost) with GEO score,
notes, MRR, and a web dashboard (filter/sort, status updates, PDF download).
**Why it's good:** Lets agency users *run their GEO business* inside our app — stickiness and a
clear premium-tier feature. (For our SaaS this can become the workspace's site/project manager.)

### 33. Proposal Generator — `⚪`
**What it does:** Turns audit data into a client-ready proposal — findings, tiered packages with
pricing, ROI projection, engagement timeline — and recommends a tier from the score.
**Why it's good:** Closes the loop from "found problems" to "here's the paid plan to fix them."
Pure revenue enablement for agency customers; a strong reason to upgrade.

### 35. Traffic Proof (Search Console + AI referrals) — `⚪` ➕
**What it does:** Connects Google Search Console (clicks/impressions/position) and optionally
GA4 (sessions referred by chatgpt.com, perplexity.ai, gemini.google.com, …) and renders them
on the score trend with audit-date markers. Feeds the digest and reports. Never metered.
**Why it's good:** The score is a number *we* invented; clicks are a number the customer already
trusts. "Score 61→74 and clicks +23%" is proof layer 3 — the line that renews subscriptions.
Cheap to build (two read-only OAuth integrations), disproportionate retention value.

---

## 8. How this maps onto our product

Our roadmap (`docs/v1-implementation-phases.md`) already covers **create & publish**
(research → topic backlog → article generation → scheduling → publishing connectors).
This catalog adds the **measure & optimize** layer that wraps around it:

| Our existing phase | Tools from this catalog that plug in |
|---|---|
| Phase 2 — Brand setup | #3 Business-Type Detector, #23 Brand scanner (seed entity profile), #26 Entity/`sameAs` |
| Phase 3 — Article generation | #14 Citability scorer + #11 Readability + #19 AI-content detector as **live editor scores**; #16 FAQ/Speakable + #9 Schema auto-attached to each draft |
| Phase 4 — Research & backlog | #18 PAA/Question targeting + #12 Topical-authority/content-gap feed the backlog |
| Phase 5 — Scheduling/autonomy | #1 Audit + #31 Delta tracker run on cron → automatic monthly progress; #13 Freshness → auto-refresh suggestions |
| Phase 6 — Publishing | Post-publish, re-run #14/#17 to confirm the live page is answer/AI-ready |
| New surface — "Visibility" | #1 Audit, #2 Snapshot, #20–#25 GEO suite, #34 Answer tracking, #35 Traffic proof, #28–#29 Reports as a dashboard section |
| New surface — Agency/premium | #30 White-label, #32 CRM, #33 Proposals as plan-gated features |

---

## 9. Suggested build priority

A pragmatic order — high value, low effort first, reusing our existing fetch/LLM plumbing:

1. **Quick wins / lead-gen (do first):** #2 Quick Snapshot, #20 Crawler Access, #21 llms.txt
   generator, #9 Schema generator, #8 Meta audit — shipped as **free public tools** feeding the
   growth funnel (V8.6). *(Cheap, instantly useful, they ARE the marketing.)*
2. **The scoring spine:** #1 Unified Audit + #14 Citability scorer (deterministic, the core IP)
   + #4/#5 Technical + SSR.
3. **Proof early (pull-forward):** #31 Delta tracker, **#34 Answer tracking** (the demo moment —
   independent of the audit engine), **#35 Traffic proof** (connect early so history accrues),
   #27 Competitor benchmark in lite mode.
4. **Editor integration (our differentiator):** wire #14, #11, #16, #19 into the article editor so
   we **write content that's already optimized**, not just audit after the fact.
5. **GEO depth:** #23 Brand scanner, #24 Platform optimizer, #26 Entity/`sameAs`, #22 Content
   Signals, #25 Agent-readiness — completes the full #27 grid.
6. **Prove & monetize:** #28/#29 Reports, then #30/#32/#33 for the agency tier.

> **Our edge:** competitors *audit*; we *audit, auto-fix in the same product, and prove the result*.
> Tools #14, #16, #19, #12, #13 don't just grade a page — they feed directly into the AI that
> writes and refreshes it; #34/#35 then show the citation and the click that resulted.
