# SEO_AI — Features & User Journeys (E2E Test Reference)

> Reference catalogue of every feature, route, and user journey for end-to-end
> testing. Keep this in sync when behaviour changes. Last updated: 2026-06-24.

## 1. Architecture (what E2E hits)

The app is **fully client-side**: every `(app)` page is a `"use client"`
component that fetches through **TanStack Query** hooks talking to JSON **`/api`
route handlers**. There is no RSC data fetching and no server actions.

- Data hooks + types: `src/lib/api/queries.ts` (`queryKeys`, `useMe`, `useDashboard`, …)
- Client fetch wrapper: `src/lib/api/fetcher.ts` (`apiGet/apiPost/apiPatch/apiPut/apiDelete`, `ApiError`)
- Route helpers: `src/lib/api/server.ts` (`handleApi`, `getApiContext`, `requireApiBrand`, `parseBody`, `HttpError`)
- Loading UX: `LoadingButton` (circular spinner) + `PageLoader`/`PageError` states
- Auth/redirect guard: `src/app/(app)/layout.tsx` (client) using `useMe()`

**E2E assertion conventions**
- Every async button shows a **circular spinner** and is disabled while pending.
- Every data page shows a **PageLoader** spinner, then content or a **PageError** with "Try again".
- Mutations show a **toast** (`success` / `danger`) on completion.

---

## 2. Route map

### Pages
| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Marketing landing (hero + pricing) |
| `/login` | public | Google / GitHub sign-in |
| `/onboarding` | auth | Create-brand wizard (5 steps) |
| `/dashboard` | auth + brand | Overview: KPIs, onboarding checklist, research, recent articles |
| `/topics` | auth + brand | Research panel + topic queue + manual topic + generate |
| `/articles` | auth + brand | Article list |
| `/articles/[id]` | auth + brand | Article editor + publishing panel |
| `/activity` | auth + brand | Timeline of research runs + agent jobs (+ retry) |
| `/settings` | auth | General: autonomy mode |
| `/settings/brand` | auth + brand | Brand profile + competitors |
| `/settings/integrations` | auth + brand | Publishing connectors |
| `/settings/billing` | auth | Plans, subscription status, Stripe portal |

### API routes
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/me` | Session user, workspace, subscription, brands, active brand, `llmReady` |
| GET | `/api/dashboard` | Aggregated dashboard payload |
| GET / POST | `/api/brands` | List brands / create brand (onboarding) |
| PATCH / DELETE | `/api/brands/[id]` | Rename / delete brand (never the last) |
| PUT | `/api/brands/active` | Switch active brand (cookie) |
| GET / PUT | `/api/brand/profile` | Get / upsert brand profile |
| GET / POST | `/api/brand/competitors` | List / add competitor |
| DELETE | `/api/brand/competitors/[id]` | Remove competitor |
| GET / POST | `/api/topics` | List topic queue / add manual topic |
| GET | `/api/articles` | List articles |
| GET / PATCH | `/api/articles/[id]` | Get (incl. publications) / save edits |
| POST | `/api/articles/generate` | Generate article from a topic |
| POST | `/api/articles/[id]/publish` | Publish to enabled destinations |
| GET | `/api/articles/[id]/export` | Download article as Markdown |
| GET / POST | `/api/research` | Latest + recent runs / run research |
| GET / PATCH / PUT | `/api/integrations` | List / toggle enable / save config+key |
| GET / POST | `/api/activity` (+ `/retry`) | Timeline / retry a failed item |
| PATCH | `/api/workspace/settings` | Update autonomy mode |
| POST | `/api/billing/checkout` | Stripe Checkout session |
| POST | `/api/billing/portal` | Stripe customer portal |
| POST | `/api/webhooks/stripe` | Stripe webhook (subscription state) |
| POST | `/api/cron/weekly` | Weekly autonomous pipeline |

---

## 3. Feature catalogue

### 3.1 Authentication & workspace
- Sign in with **Google** or **GitHub** (better-auth social). `AUTH_DEV_BYPASS=true` short-circuits to a dev user/workspace.
- On first user creation a **workspace** is auto-provisioned with an `inactive` subscription, plan `indie`, weekly cap `0`.
- Sign out from the sidebar user menu → redirects to `/login`.
- Unauthenticated access to any `(app)` page → redirect to `/login`.

### 3.2 Multi-brand
- A workspace owns many brands; all content is scoped by `brand_id`. Subscription + weekly cap are **shared per workspace**.
- **Create brand** via 5-step onboarding wizard (see Journey 2).
- **Switch brand** from the sidebar switcher (cookie-backed); switching invalidates the whole query cache so all pages rescope.
- **Add brand** entry in the switcher → `/onboarding`.
- Workspace with 0 brands → any `(app)` page redirects to `/onboarding`.
- Rename / delete brand endpoints exist (`PATCH`/`DELETE /api/brands/[id]`); delete refuses the last remaining brand. (No dedicated UI yet.)

### 3.3 Brand profile & competitors (`/settings/brand`)
- Profile fields: product description, target audience, tone, website (URL), seed keywords. Saved via `PUT /api/brand/profile`.
- Competitors: name + website URL (required), optional RSS + sitemap URLs. Add/remove. Used as research inputs.

### 3.4 Topic research & queue (`/topics`)
- **Run research** → discovers ranked topics from web search, competitor feeds, emerging queries (rate limit **10/hr/workspace**). Shows last-run summary + topics added.
- **Manual topic**: title (≥3 chars), angle, keywords.
- Topic queue with filter chips: **All / Research / Manual**; shows score, status, rationale, answer fit, evidence URLs.
- **Generate article** from a topic (per-row button). Free tier shows "Generate free article"; paid shows "Generate article".
- Warns when LLM env vars are not configured (`llmReady === false`).

### 3.5 Articles (`/articles`, `/articles/[id]`)
- List sorted by last updated; status chip (draft/review/approved), slug, tags.
- Editor: title, slug, meta description, tags (comma-separated), Markdown body (rich-text editor). Save via `PATCH /api/articles/[id]`.
- **Save as draft** (status `draft`) and **Approve & publish** (status `approved` then publish). **Re-publish** for approved articles.
- Per-destination **publishing panel** with status, external URL, error, attempt count.
- **Export** article as Markdown (`/api/articles/[id]/export`).
- Article statuses: `draft`, `review`, `approved`. (Editor exposes draft/approved.)

### 3.6 Publishing integrations (`/settings/integrations`)
- Available + configurable: **Markdown export, Generic webhook, Dev.to, Hashnode, WordPress, Ghost**.
- "Coming soon" (not configurable): **Medium, LinkedIn**.
- Each connector: enable/disable toggle + provider-specific config + API key/secret (encrypted). Secret field shows "Saved — enter to replace" when present.

### 3.7 Activity (`/activity`)
- Unified timeline merging **research runs** + **agent jobs** (research / writing / weekly_pipeline), newest first.
- Shows status, message, LLM token usage (when present), detail.
- **Retry** appears on `failed` items (`POST /api/activity/retry`); writing/weekly retries require an active plan.

### 3.8 Dashboard (`/dashboard`)
- Plan chip (or "Free plan"), autonomy chip, latest research status chip.
- Free-tier banner: "Your first article is on us" / "You're on the free tier".
- KPI tiles: **Weekly cap meter** (active) or **Unlock tile** (free), Articles, Approved, Topics queued.
- **Onboarding checklist** (5 steps with progress meter): brand profile, integration, research, first article, publish — hides when complete.
- Topic research summary + recent articles list.

### 3.9 Settings — autonomy (`/settings`)
- **Auto-publish** switch: `REVIEW` (new articles stay drafts) ↔ `FULL_AUTO` (approved + auto-published). Turning ON shows a **confirmation dialog**; turning OFF is immediate. Saved via `PATCH /api/workspace/settings`.

### 3.10 Billing (`/settings/billing`)
- Plans: **Indie $29 / 4wk**, **Startup $69 / 10wk** (Popular), **Scale $199 / 50wk**, **Enterprise $499 / 300wk**.
- New users → Stripe **Checkout**; existing customers switching plans → Stripe **Portal**. "Manage billing in Stripe" when a customer exists.
- Active state shows status chip, plan, and weekly usage meter.
- `?upgrade=1` shows the "need an active plan" notice.

### 3.11 Free-tier & gating rules
- App is **free to browse**. Only **article generation/publishing** is gated.
- **Free sample**: 1 article generation per workspace (`FREE_SAMPLE_ARTICLES = 1`), forced to draft, not auto-published.
- After the sample, generation/publishing require an **active** subscription (`status ∈ {active, trialing}`) — gate on status, not plan id.
- Rate limits per workspace: research **10/hr**, generate **20/hr**, publish **30/hr**.
- Weekly cap enforced per workspace by plan.

### 3.12 Autonomous weekly pipeline (`/api/cron/weekly`)
- For each brand: run research, then generate articles for top pending scored topics up to the weekly cap; in `FULL_AUTO` mode approves + auto-publishes. Surfaces as `weekly_pipeline` jobs in Activity.

---

## 4. End-to-end user journeys

> Format — **Pre:** preconditions · **Steps** · **Expect:** observable result · **Endpoints**

### Journey 1 — First sign-in
- **Pre:** logged out, no account.
- **Steps:** `/` → "Get started free" → `/login` → Continue with Google/GitHub (button shows spinner) → OAuth → redirect `/dashboard`.
- **Expect:** workspace auto-created; 0 brands → auto-redirect to `/onboarding`.
- **Endpoints:** `/api/auth/*`, `/api/me`.

### Journey 2 — Create first brand (the wizard)
- **Pre:** authed, no brand, on `/onboarding`.
- **Steps:** Step 1 name (+ optional website) → Continue → positioning → keywords → competitor (optional) → publishing (optional "Skip for now") → **Create brand** (spinner).
- **Expect:** brand created + made active; redirect `/dashboard`.
- **Negative (the historic bug):** invalid website like `acme.com` → inline error "Enter a valid website URL, including https://", jumps to step 1, **no silent no-op**; empty name → "Brand name is required".
- **Endpoints:** `POST /api/brands`.

### Journey 3 — Configure brand profile + competitors
- **Pre:** authed + brand, `/settings/brand`.
- **Steps:** fill profile → **Save brand profile** (spinner, success toast); add a competitor (name + URL) → **Add competitor** (form resets); remove a competitor.
- **Expect:** values persist across reload; onboarding checklist "brand profile" ticks once product description is set.
- **Endpoints:** `PUT /api/brand/profile`, `POST`/`DELETE /api/brand/competitors`.

### Journey 4 — Research → topic queue
- **Pre:** authed + brand, LLM configured, `/topics`.
- **Steps:** **Run research** (spinner) → success toast; queue populates with scored topics; filter All/Research/Manual; add a manual topic.
- **Expect:** last-run summary + topics-added count; rate-limit (>10/hr) → danger toast.
- **Endpoints:** `POST /api/research`, `GET /api/topics`, `POST /api/topics`.

### Journey 5 — Generate the free sample article
- **Pre:** authed + brand, **no active plan**, free sample unused.
- **Steps:** `/topics` → topic shows "Generate free article" → press (spinner) → redirect `/articles/[id]`.
- **Expect:** article created as **draft**; free sample now consumed (subsequent generate → upgrade).
- **Negative:** sample already used → `402` → redirect `/settings/billing?upgrade=1`.
- **Endpoints:** `POST /api/articles/generate`.

### Journey 6 — Subscribe to a plan
- **Pre:** authed, free tier, `/settings/billing`.
- **Steps:** choose a plan → **Subscribe** (spinner "Redirecting…") → Stripe Checkout → complete → webhook activates subscription.
- **Expect:** on return, status chip = active, plan + weekly cap shown; generation unlocked.
- **Endpoints:** `POST /api/billing/checkout`, `POST /api/webhooks/stripe`, `GET /api/me`.

### Journey 7 — Edit, approve & publish an article
- **Pre:** **active plan**, an integration enabled, an article exists.
- **Steps:** `/articles/[id]` → edit fields → **Approve & publish** (spinner) → success toast; check publishing panel per destination; **Re-publish** after fixing a connector; **Save as draft** alternative.
- **Expect:** status → approved; publication rows show published/failed + external URL.
- **Negative:** no active plan → "Upgrade to publish" link; publish failure → danger toast + error in panel.
- **Endpoints:** `PATCH /api/articles/[id]`, `POST /api/articles/[id]/publish`.

### Journey 8 — Connect a publishing integration
- **Pre:** authed + brand, `/settings/integrations`.
- **Steps:** pick a connector (e.g. Dev.to / webhook) → enter key/config → **Save connection** (spinner, success toast) → **Enable**.
- **Expect:** "Enabled" chip; secret field shows "Saved — enter to replace"; onboarding "integration" step ticks.
- **Endpoints:** `PUT /api/integrations`, `PATCH /api/integrations`.

### Journey 9 — Switch autonomy to auto-publish
- **Pre:** authed, `/settings`.
- **Steps:** toggle Auto-publish ON → **confirmation dialog** → Enable → success toast; toggle OFF is immediate.
- **Expect:** dashboard autonomy chip reflects mode; new articles default approved+auto-publish in FULL_AUTO.
- **Endpoints:** `PATCH /api/workspace/settings`.

### Journey 10 — Multi-brand switching
- **Pre:** authed with ≥2 brands.
- **Steps:** sidebar switcher → pick another brand (spinner) → all pages rescope; "Add brand" → `/onboarding`.
- **Expect:** topics/articles/activity/dashboard reflect the selected brand only.
- **Endpoints:** `PUT /api/brands/active`, then cache-wide refetch.

### Journey 11 — Activity & retry
- **Pre:** authed + brand with a failed job/run.
- **Steps:** `/activity` → timeline newest-first → **Retry** on a failed item (spinner) → success toast.
- **Expect:** new run/job appears; writing/weekly retry without active plan → upgrade error toast.
- **Endpoints:** `GET /api/activity`, `POST /api/activity/retry`.

### Journey 12 — Billing management
- **Pre:** active subscriber with Stripe customer.
- **Steps:** `/settings/billing` → "Manage billing in Stripe" or "Switch plan" → Portal; verify usage meter.
- **Endpoints:** `POST /api/billing/portal`.

---

## 5. Negative / edge cases to cover
- Unauthenticated `(app)` route → `/login`.
- Authenticated, 0 brands → `/onboarding` (all `(app)` routes).
- Weekly cap reached → generate returns `409` (`CAP_REACHED`) → danger toast.
- Rate limited → `429` (`RATE_LIMITED`) → danger toast.
- Generation/publish without entitlement → `402` (`UPGRADE_REQUIRED`) → redirect to billing.
- Invalid form input (URLs, short titles) → inline error / `400` with message.
- API/network failure on a page → `PageError` with working "Try again".
- LLM not configured → topics page warning; research/generation degrade.
- Delete the only brand → `400` (blocked).
