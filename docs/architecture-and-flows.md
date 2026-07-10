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
   "0 10 * * 1"          │                                               │
                         │  bindings: HYPERDRIVE, CACHE(KV), EMAIL,      │
                         │            ASSETS, AGENT_WORKFLOW,            │
                         │            SETUP_WORKFLOW, AUDIT_WORKFLOW ─┐  │
                         └───────────────────────────────────────────┼──┘
                                                                      │ create()/createBatch()
                                                                      ▼
                         ┌─────────────────────────────────────────────┐
                         │  agent-workflow worker (workers/agent)        │
                         │  DailyBrandWorkflow | SetupRunWorkflow |      │
                         │  AuditRunWorkflow                             │
                         │  durable, checkpointed; NO db access —        │
                         │  calls back into the app over HTTP            │
                         └───────────────────────────────────────────┬──┘
                                  POST /api/agent/{plan,research,      │
                                       write-article,settle,           │
                                       setup-step,audit-step}          │
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
                runDueCheckpoints() / source weights (C4) best-effort
                maybeRediscoverCompetitors()   every 15 days, best-effort
                maybeRunWeeklySiteHealth()     best-effort
                refreshAgentBrief()            best-effort
                if paused_no_credits ⇒ sendOutOfCreditsEmail() (throttled weekly)
```

Idempotency budget model: the daily cap bounds the **agent's** output only
(`daily_runs.articlesWritten`); manual generation never eats into it. Credits are
the real budget — the day stops at `insufficient_credits`.

### 2.2 Visibility monitoring — `0 9 * * *` → `POST /api/cron/visibility`

```
POST /api/cron/visibility
  authorize
  settleStaleAudits()
  listDueSites()   // DISTINCT ON owned complete audits + active sub + cadence
  AUDIT_WORKFLOW.createBatch per due site
     id = reaudit-<dayKey>-<baselineAuditId>
     params: mode "monitor", workspaceId, siteUrl, baselineAuditId, planId

  // Fallback without binding (next dev): sequential reauditSite()
```

Each `AuditRunWorkflow` (mode monitor):

```
1. create   → create audit row (reuse recent running if lost response)
2. execute  → executeAudit (charge NOT here — monitor is plan cadence work;
              manual mode charges on success)
3. finish   → verifyAppliedFixes + dispatchFixes + compareAudits + alert
              alert if overall drop ≥ DROP_THRESHOLD (5 pts) OR new criticals
              stamp monitorFinishedAt
4. answers  → runScheduledAnswerCheck (credit-gated, non-fatal)
```

**Fix dispatch honesty:** `canLiveApply()` is currently **false** for all
capabilities. Level 2 (Autopilot on `fix_capability: auto`) therefore
**proposes** ready-to-install artifacts (`proposedAt`), it does **not** mark
findings `auto_applied`. Owner installs on their origin, then marks done
(`user_applied`). Next re-audit verifies; re-detection reopens the finding.
When a real CMS/host channel ships, flip `canLiveApply` per capability.

Safe to fire daily: the cadence gate makes most days a no-op per site.

### 2.3 Weekly digest — `0 10 * * 1` → `POST /api/cron/digest`  (AP5)

```
POST /api/cron/digest
  authorize
  sendWeeklyReports():
    for each owned site with an active subscription:
       latest two completed audits → compareAudits → delta
          └─ fewer than two audits ⇒ skip (no baseline yet)
       answerRuns last 7d → share
       fix counts · build report · email owner · archive /reports
```

Scale caveat: single-request fan-out (not Workflow). Each site is best-effort.

---

## 3. One-time ignition — Setup Run (AP2)

Not a cron. Triggers (all idempotent on the per-brand `setup_runs` row):
1. `POST /api/brands` after paid onboarding (when sub active)
2. Client `POST /api/setup-run` / poll GET (self-heals stale runs)
3. Stripe webhook / checkout confirm → `igniteWorkspaceSetupRuns`

```
startSetupRun → SetupRunWorkflow (or inline waitUntil without binding)
  each step → POST /api/agent/setup-step
  finalize → finalizeSetupRun
```

Steps (metered like the same work done manually; spend after success, idempotent
by refId; short balance → skip with note, never wedge):

1. first_audit          runAudit(own site) — charge visibility_audit
2. seed_prompts         LLM → trackedPrompts (cap = plan.trackedPrompts)
3. answer_check         runAnswerCheck — charge answer_run
4. competitor_baseline  discover + runAudit(rival, kind=benchmark) — charge competitor_benchmark
5. topic_research       runResearch(idempotencyKey = setup-<brandId>) — charge research_run
6. quick_win_fixes      FULL_AUTO only: stamp proposedAt on auto findings (no fake auto_applied)
7. first_article        generateArticleFromTopic (metered)
8. day0_brief           LLM brief → setup_runs.briefText

**Completion rule:** `finalizeSetupRun` marks `completed` only if at least one
**material** step is `done` (`first_audit`, `answer_check`, `competitor_baseline`,
`topic_research`, `first_article`). All-skipped / all-failed → `failed` (Resume).

Stale-run takeover: `isSetupRunStale` (15 min silent) + GET poller CAS + resume.

---

## 4. On-demand / user flows (not scheduled)

- **Auth**: better-auth at `/api/auth/[...all]`. Workspace + free signup grant (100 credits).
- **Billing**: Stripe checkout → webhook **or** `/api/billing/checkout/confirm` →
  subscription rows + monthly credit grant; entitlements in `plans.ts`.
- **Manual audit / tools / answers / site-health**: credit assert → work → charge on success.
  Overlap with Setup Run blocked via `assertNoSetupRunning` where work races setup.
- **Fix queue**: copy/download artifact → owner installs on site → "I installed this"
  (`user_applied`). Not a live host write.
- **Article authoring**: editor + `/api/articles/*`, publish adapters
  (devto/ghost/hashnode/wordpress/webhook/markdown). Publish requires active sub.
- **Integrations**: GSC/GA4 traffic via `syncTrafficForBrand` (unmetered).
- **Public quick check**: `/api/visibility/quick` IP-limited, KV-cached, signup token.
- **Internal smoke test** (CRON_SECRET-gated): `POST /api/agent/test-run`.

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
| Re-audit cadence | `dueForReaudit` gate; `monitorFinishedAt` for unfinished finish |
| Benchmark audits | `kind=benchmark` never writes fix-queue findings as owned work |
| Live fix apply | `canLiveApply` gate (currently always false) |
| Ephemeral cache | KV (`CACHE`), never Postgres |

---

## 6. Review findings & resolutions

Gaps found while tracing these flows, and what was done:

1. **Setup Run could wedge in `running` forever.** Fixed: `isSetupRunStale` + poller resume.
2. **Failed daily enqueues looked like success.** Fixed: `scheduled()` throws on non-OK.
3. **Settle wasn't fully idempotent.** Fixed: upsert first, job logging best-effort.
4. **Ignition read arbitrary subscription row.** Fixed: prefer active plan.
5. **Weekly digest zero-delta on single-audit sites.** Fixed: skip without baseline.
6. **Visibility monitoring was sequential in one request.** Fixed: `AuditRunWorkflow` fan-out.
7. **`/api/cron/test-email` test debris.** Removed.
8. **`countNewCriticals` dedupes by `category::title`.** Keep titles stable.
9. **Auto-apply lied about live site changes** (2026-07-09). Fixed: `canLiveApply`
   gate; agent proposes; owner marks installed; honest UI/copy; setup prepares not applies.
10. **Setup completed on all-skips.** Fixed: material-step completion rule.
11. **Onboarding checklist drifted from Setup Run product.** Fixed: website / setup /
    CMS / article / publish-or-fix checklist.
12. **Toolbox raced Setup Run.** Fixed: `assertNoSetupRunning` on tool POST.
13. **Architecture doc stale** (setup free, sequential visibility, drop≥8). This file
    refreshed to match code.
