# seogeoaeo.ai — Architecture & Flows (as-built)

This document plots what the app actually does at runtime: the deployment topology,
every scheduled/cron flow, the durable agent pipeline, and the one-time ignition
pipeline. It is written from the code (not the marketing spec) so it can be used to
review whether each flow is wired correctly. A companion review section at the end
lists gaps found while tracing these flows.

---

## 1. Deployment topology

Two Cloudflare Workers, one Postgres (via Hyperdrive), one KV namespace.

```
                         ┌─────────────────────────────────────────────┐
   Cloudflare cron ─────▶│  seo-ai worker  (.open-next/worker.js)        │
   "0 8 * * *"           │  = Next.js app (OpenNext) + patched           │
   "0 9 * * *"           │    scheduled() handler                        │
                         │                                               │
                         │  bindings: HYPERDRIVE, CACHE(KV), EMAIL,      │
                         │            ASSETS, AGENT_WORKFLOW ────────┐   │
                         └───────────────────────────────────────────┼──┘
                                                                      │ create()/createBatch()
                                                                      ▼
                         ┌─────────────────────────────────────────────┐
                         │  agent-workflow worker (workers/agent)        │
                         │  class DailyBrandWorkflow                     │
                         │  durable, checkpointed; NO db access —        │
                         │  calls back into the app over HTTP            │
                         └───────────────────────────────────────────┬──┘
                                  POST /api/agent/{plan,research,      │
                                       write-article,settle}          │
                                  Authorization: Bearer CRON_SECRET   ▼
                                          (back to seo-ai worker)
```

Key facts:
- The `scheduled()` handler is **not** in source; it is patched into
  `.open-next/worker.js` by `scripts/build-cloudflare.mjs`. It maps each cron
  expression to a route and POSTs to it with `Authorization: Bearer CRON_SECRET`.
- Cron → route map lives in **two** places that must stay in sync:
  `wrangler.jsonc` `triggers.crons` and the `cronRoutes` table in the build script.
- The Workflow worker holds no DB creds; it is a pure orchestrator that HTTP-calls
  `/api/agent/*`, each of which re-checks `CRON_SECRET` via `isCronAuthorized`.

---

## 2. Cron flows

### 2.1 Daily content agent — `0 8 * * *` → `POST /api/cron/daily`

Enumerator only; does no content work.

```
POST /api/cron/daily
  authorize (CRON_SECRET)
  runDate = getUtcDayKey()
  workspaces = listActiveWorkspaceIds()          // active subscription only
  for each workspace: listBrands()
  build instances: id = daily-<brandId>-<runDate> // deterministic ⇒ idempotent
  AGENT_WORKFLOW.createBatch(chunks of 100)
     └─ on batch failure (id collision) → per-instance create(), skip "already exists"
  failed>0 ⇒ HTTP 500 → scheduled() throws ⇒ invocation recorded as failed
     (Cloudflare does NOT auto-retry crons; recovery is a manual re-fire or the
      next day's schedule. Re-firing is safe: existing ids collide and skip.)
```

Each instance runs `DailyBrandWorkflow.run`:

```
1. plan     → POST /api/agent/plan     → planDailyForBrand()
                cap = dailyArticleCapForPlan(planId); if cap<=0 skip("idle")
                writtenToday from daily_runs row; budget = cap - writtenToday
                budget<=0 ⇒ upsert idle + skip
                topicIds = listPendingTopicsForWriting(budget)
                needsResearch = pending < budget
   if plan.skip ⇒ return

2. research  → POST /api/agent/research → researchForDaily()   (only if needsResearch)
                assertHasCredits(research_run) else swallow (research optional)
                runResearch(idempotencyKey = instanceId); spendCredits keyed on runId
                returns refreshed topicIds

3. write:<topicId>  (one durable step per topic, up to budget)
     → POST /api/agent/write-article → generateArticleFromTopic()
        status: written | insufficient_credits(stop day) | skipped | failed(retry 500)
        on `written`, generate.ts also publishArticleToDestinations() if configured
     retries 3× exp backoff, 5-min timeout; a step that exhausts retries is caught
     so one bad article never sinks the day

4. settle   → POST /api/agent/settle   → settleDailyForBrand()
                status = paused_no_credits | no_topics | active
                upsert daily_runs (absolute values, idempotent)
                createAgentJob("daily_pipeline") + finishAgentJob  (overview stats;
                  best-effort AFTER the upsert — jobs are not idempotent, so a
                  failure here must never 500 the step and trigger a retry)
                syncTrafficForBrand()          best-effort, unmetered
                maybeRediscoverCompetitors()   every 15 days, best-effort
                if paused_no_credits ⇒ sendOutOfCreditsEmail() (throttled weekly)
```

Idempotency budget model: the daily cap bounds the **agent's** output only
(`daily_runs.articlesWritten`); manual generation never eats into it. Credits are
the real budget — the day stops at `insufficient_credits`.

### 2.2 Visibility monitoring — `0 9 * * *` → `POST /api/cron/visibility`

```
POST /api/cron/visibility
  authorize
  reauditActiveSites():
    latestAuditPerSite()   // DISTINCT ON (workspace, siteUrl), kind=owned,
                           //   status=complete, active subscription
    filter dueForReaudit(lastAuditAt, plan.monitoringCadence)   // weekly=7d/monthly=30d
    for each due site:
       createAudit + executeAudit                // full 3-stage re-audit
       autoApplyFixes()                          // FULL_AUTO brands only: apply
                                                 //   auto-capable findings up to
                                                 //   plan.autoFixCap (V8.5 loop)
       compareAudits(baseline, new) → delta
       countNewCriticals(baseline, new)
       shouldAlert(delta, newCriticals)          // drop>=8pts OR any new critical
    return alerts[]
  for each alert: sendToWorkspaceOwner(visibilityAlertEmail) + logInfo
```

Safe to fire daily: the cadence gate makes most days a no-op per site.

Known scale ceiling: unlike the daily agent, this loop is NOT a durable
Workflow — every due site is re-audited sequentially inside one HTTP request.
Per-site failures are logged and skipped (the route still returns 200), and a
site whose audit never completes stays `status!=complete`, so it remains due
and self-heals on the next day's fire. If the due-site count grows enough to
threaten request limits, fan this out like the daily agent.

### 2.3 Weekly digest — `0 10 * * 1` → `POST /api/cron/digest`  (AP5)

```
POST /api/cron/digest
  authorize
  sendWeeklyDigests():
    for each owned site with an active subscription:
       latest two completed audits → compareAudits → delta
          └─ fewer than two audits ⇒ skip (no baseline yet — a zero-delta
             digest on a new customer's first Monday is worse than silence)
       answerRuns last 7d for the site's brand → computeShare
       fix counts on the current audit (applied / awaiting approval)
       buildDigest (proof-stack order) → weeklyDigestEmail → owner
```

Same single-request shape (and the same scale caveat) as §2.2; each site is
best-effort, so one failed digest never blocks the rest.

---

## 3. One-time ignition — Setup Run (AP2)

Not a cron. Two triggers, both idempotent on the per-brand `setup_runs` row:
1. Client-side fire-and-forget after onboarding / from the Claudia hero
   (`POST /api/setup-run`).
2. Server-side from the Stripe webhook on `checkout.session.completed`
   (`igniteWorkspaceSetupRuns`, backgrounded via `waitUntil`) — so ignition
   survives a closed tab.

```
POST /api/setup-run
  requireApiBrand(); require active subscription (trialing counts) else 402
  startSetupRun(scope)          // one setup_runs row per brand (unique index)
  if created OR status==failed OR isSetupRunStale(run):
     executeSetupRun() in background via ctx.waitUntil
  return 202  (client polls GET /api/setup-run)

executeSetupRun — ordered, resumable, plan-included (no credit spend):
  1. first_audit          runAudit(own site)
  2. seed_prompts         LLM → trackedPrompts (cap = plan.trackedPrompts)
  3. answer_check         runAnswerCheck across engines
  4. competitor_baseline  discoverCompetitors + runAudit(rival, kind=benchmark)
  5. topic_research       runResearch(idempotencyKey = setup-<brandId>)
  6. quick_win_fixes      only if autonomyMode==FULL_AUTO;
                          applyFix() up to min(plan.autoFixCap, 10)
  7. first_article        generateArticleFromTopic(skipCreditCheck)
  8. day0_brief           LLM brief; persisted to setup_runs.briefText
  each step: done|skipped(input-less)|failed(marks run failed, resumes next trigger)
```

Stale-run takeover: the pipeline runs inside `waitUntil`, so a hard kill
(isolate eviction, wall clock) can strand a run in `running` without ever
reaching the catch that marks it `failed`. Both triggers therefore also resume
a run whose row hasn't been touched in 15 min (`isSetupRunStale`) — every step
persists progress within minutes, so a silent quarter-hour means the executor
died. Takeover re-runs any step not yet done/skipped.

---

## 4. On-demand / user flows (not scheduled)

- **Auth**: better-auth at `/api/auth/[...all]`.
- **Billing**: Stripe checkout → `/api/webhooks/stripe` → subscription rows;
  entitlements from `src/lib/billing/plans.ts` (`visibilityCapsForPlan`,
  `dailyArticleCapForPlan`, `ACTIVE_SUBSCRIPTION_STATUSES`).
- **Manual audit / quick check**: `/api/visibility/*` (public quick, summary,
  answers, traffic, pdf, badge, fix).
- **Manual fix apply**: `POST /api/visibility/fix` → `applyFix`.
- **Article authoring**: editor + `/api/articles/*`, publish adapters
  (devto/ghost/hashnode/wordpress/webhook/markdown).
- **Integrations**: GSC/GA4 traffic via `syncTrafficForBrand`.
- **Internal smoke test** (CRON_SECRET-gated, Cloudflare runtime only):
  `POST /api/agent/test-run` — enqueue one brand's `DailyBrandWorkflow` on
  demand, reusing the daily `daily-<brand>-<date>` instance id so it can never
  race the real cron into a duplicate day.

---

## 5. Data & idempotency contract

| Concern | Mechanism |
|---|---|
| Same-day daily re-fire | Workflow instance id `daily-<brand>-<date>` collides ⇒ no-op |
| Retried write step | `generateArticleFromTopic` article-by-topic guard ⇒ no re-charge |
| Retried research | `idempotencyKey` (instance id) reuses run; spend keyed on runId |
| Setup run re-trigger | resumes from first non-done/skipped step |
| Setup run killed mid-step | `isSetupRunStale` (15 min silent ⇒ takeover) |
| Retried settle step | `daily_runs` upsert first; job logging best-effort after |
| Re-audit cadence | `dueForReaudit` gate; safe to fire daily |
| Benchmark audits | `kind=benchmark` never writes findings / never re-audited |
| Ephemeral cache | KV (`CACHE`), never Postgres |

---

## 6. Review findings & resolutions

Gaps found while tracing these flows (2026-07-05), and what was done:

1. **Setup Run could wedge in `running` forever.** A hard-killed `waitUntil`
   execution never reached the catch that marks the run `failed`, and both
   triggers only resumed `created || failed` runs. **Fixed**: `isSetupRunStale`
   lets either trigger take over a run silent for 15+ minutes (§3).
2. **Failed daily enqueues looked like success.** The patched `scheduled()`
   handler only logged a non-OK cron response; the doc wrongly claimed the cron
   "re-fires". **Fixed**: `scheduled()` now throws so the invocation is recorded
   as failed; doc corrected — Cloudflare never auto-retries crons (§2.1).
3. **Settle wasn't fully idempotent.** `createAgentJob("daily_pipeline")` ran on
   every retry attempt; a job-write failure after it would 500 the step and
   duplicate the overview row. **Fixed**: upsert first, job logging best-effort
   (§2.1).
4. **Ignition read the plan from an arbitrary subscription row.** A stale
   canceled row beside the active one could set the wrong caps. **Fixed**:
   `igniteWorkspaceSetupRuns` prefers the active subscription's plan.
5. **Weekly digest sent a zero-delta email to single-audit sites.** **Fixed**:
   sites without a baseline audit are skipped (§2.3).
6. **Visibility cron / digest run all sites in one request.** Accepted for now
   as a documented scale ceiling (§2.2) — self-healing via the cadence gate;
   fan out onto Workflows if the due-site count grows.
7. **`/api/cron/test-email` is test-only debris** with a hardcoded recipient —
   should be deleted before launch (not yet removed).
8. **`countNewCriticals` dedupes by `category::title`.** If finding titles ever
   embed dynamic values, a persistent critical would re-alert every cycle —
   keep titles stable.
