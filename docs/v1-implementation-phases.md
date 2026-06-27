# SEO_AI v1 Implementation Phases

> Goal: build a lean, fully working SaaS v1. Each phase should leave the product
> in a demoable state and avoid abstractions that are not needed by the current
> phase.

## Phase 0 - Project foundation

Build the deployable app skeleton.

### Scope

- Scaffold Next.js + TypeScript for Cloudflare Workers.
- Add Tailwind and a small reusable UI foundation.
- Add Drizzle, PlanetScale Postgres config, and migration scripts.
- Add `.env.example` with required runtime variables.
- Add lint, typecheck, test, build, and README command docs.
- Add basic app shell: landing page, dashboard shell, settings layout.

### Acceptance criteria

- App builds locally and for Cloudflare.
- Environment variables are documented.
- Empty dashboard routes render behind auth placeholders.
- CI-ready commands exist for lint, typecheck, test, and build.

## Phase 1 - Auth, workspace, and billing

Make the product usable as a SaaS account.

### Scope

- Configure Better Auth with Google and GitHub only.
- Create one workspace per user account.
- Add Stripe Checkout for Indie, Startup, Scale, and Enterprise plans.
- Add Stripe Customer Portal.
- Add signed Stripe webhook handling for subscription status and plan caps.
- Gate dashboard access by active subscription.

### Acceptance criteria

- User can sign in with Google or GitHub.
- User can select a plan and return to the app after Checkout.
- Stripe webhook updates local subscription state.
- Dashboard shows current plan and weekly article cap.

## Phase 2 - Brand setup and integrations

Collect the minimum inputs needed to produce useful content.

### Scope

- Brand profile form: product, audience, tone, website, seed keywords.
- Competitor CRUD with URL, RSS, and sitemap fields.
- Publishing integration settings.
- Store integration secrets through runtime secrets or encrypted references.
- Implement Markdown export as the first always-available destination.

### Acceptance criteria

- User can save brand profile and competitors.
- User can enable Markdown export.
- Integration state is visible and editable.
- No secret values are exposed in the UI, logs, or database output.

## Phase 3 - LLM utility and article generation

Prove the core value loop with a manual topic.

### Scope

- Create reusable OpenAI-compatible LLM utility.
- Support `light`, `heavy`, and `image` model tiers from env.
- Add prompt wrappers for summary, outline, draft, SEO edit, and metadata.
- Add topic creation form.
- Generate an article from a topic into Markdown.
- Add article editor with status and version basics.

### Acceptance criteria

- User can submit a topic and generate a complete Markdown article.
- Light model is used for light tasks; heavy model is used for writing/editing.
- Article includes title, slug, meta description, tags, and body.
- Generated article can be edited and saved.

## Phase 4 - Research and topic backlog

Let the product decide what to write.

### Scope

- Add research provider adapter interface.
- Implement web search and competitor RSS/sitemap discovery.
- Add trend and question discovery for rising searches, autocomplete-style
  queries, People Also Ask patterns, forum questions, and fresh SERP signals.
- Add optional keyword provider hook when env credentials exist.
- Add research run records and topic scoring.
- Build backlog UI with score, rationale, source, and status.

### Acceptance criteria

- User can run research from the dashboard.
- Research creates ranked topic ideas.
- Topics show why they were recommended.
- Emerging query topics show the query/source evidence and product-as-answer fit.
- Low-quality or duplicate topics are filtered before the backlog.

## Phase 5 - Scheduling, autonomy, and caps

Turn the manual loop into an autonomous product.

### Scope

- Add Cloudflare Cron for weekly research.
- Add scheduled writing jobs.
- Add queue/workflow handlers for long-running work and retries.
- Enforce weekly article caps by plan.
- Add workspace autonomy setting: `FULL_AUTO` default or `REVIEW`.
- Add job/activity log UI.

### Acceptance criteria

- Scheduled jobs run without user clicks.
- Plan caps prevent extra weekly articles.
- `FULL_AUTO` writes and publishes eligible articles.
- `REVIEW` writes drafts and waits for approval.
- Activity log shows job status and failures.

## Phase 6 - Publishing connectors

Publish to the user's enabled platforms.

### Scope

- Shared publishing adapter contract.
- Dev.to connector.
- Hashnode connector.
- WordPress connector.
- Ghost connector.
- Medium connector where account/API access allows it.
- LinkedIn connector where account/API access allows it.
- Generic webhook connector.
- Publication status, retries, and external URLs.

### Acceptance criteria

- User can connect at least one non-Markdown platform.
- Approved articles publish to every enabled destination.
- Failures are captured per destination without blocking successful platforms.
- Published URLs are shown on the article page.

## Phase 7 - v1 hardening

Make the product reliable enough for first customers.

### Scope

- Add structured logs and error boundaries.
- Add cost/token tracking for agent runs.
- Add basic rate limiting and abuse checks.
- Add tests for billing webhooks, LLM model routing, cap enforcement, and
  publishing adapter behavior.
- Add final onboarding polish and empty states.

### Acceptance criteria

- Critical flows have automated coverage.
- Failed jobs can be retried or inspected.
- LLM and publish costs are visible enough to debug.
- Onboarding guides a new user to first published article.

## v1 implementation order

Build in this order:

1. Foundation.
2. Auth and billing.
3. Brand setup and Markdown export.
4. Manual topic to generated article.
5. Research-generated backlog.
6. Scheduling and autonomy.
7. Publishing connectors.
8. Hardening.

This order keeps the app working throughout development and avoids building
publish automation before article quality and billing limits are in place.
