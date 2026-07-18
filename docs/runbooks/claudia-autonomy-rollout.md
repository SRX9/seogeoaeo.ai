# Claudia autonomy rollout runbook

Operational guide for staging, monitoring, and rolling back Claudia's staged
autonomy (policy version `claudia-autonomy-rollout-v1`).

- Code: `src/lib/agent/autonomy-rollout.ts`, `src/lib/agent/canary-validation.ts`
- API: `src/app/api/agent/autonomy/rollout/route.ts`
- Governance evidence: `evals/claudia/rollouts/phase8-v1.json`,
  `evals/claudia/releases/current.json`
- Eval gate: `evals/claudia/release-governance.eval.test.ts`
  (run with `pnpm eval:claudia:check`)

## Stages and autonomy levels

Autonomy levels are `0..4`. Rollout stages are `1..8` and must be traversed in
order; every stage after the first requires evidence from the prior stage
(`requiresPriorEvidence`):

| Stage | Name | Execution mode |
| --- | --- | --- |
| 1 | local_eval_replay | eval |
| 2 | staging_synthetic | synthetic |
| 3 | internal_dogfood | internal |
| 4 | real_brand_shadow | shadow |
| 5 | owner_approved_beta | live |
| 6 | delegated_small_cohort | live |
| 7 | percentage_canary | live |
| 8 | certified_capability_ga | live |

`productionAuthorityExpanded` stays `false` until every gate in the release
record passes; no stage transition may expand production authority on its own.

## Stop conditions

Trip any of these and the rollout must be paused immediately (see
[Rollback or pause a rollout](#rollback-or-pause-a-rollout)):

- authority_violation
- cross_tenant_access
- duplicate_billing_or_remote_mutation
- unsupported_auto_published_claim
- verification_or_rollback_regression
- unexpected_spend_or_volume
- search_quality_regression
- business_metric_harm
- trace_reconstruction_failure

## Advancing a stage

1. Confirm the current stage's canary evidence via `getAutonomyReadiness` /
   `recordCanaryMeasurement` (`src/lib/agent/canary-validation.ts`).
2. Run `pnpm eval:claudia:check` — all suites in
   `evals/claudia/suites/catalog-v1.json` must pass at threshold 1.
3. Transition with `transitionAutonomyRollout`; `assessRolloutTransition`
   enforces stage ordering and prior-evidence requirements.
4. Record the decision; decisions are queryable with `listAutonomyDecisions`.

## Rollback or pause a rollout

Pausing never requires new evidence and never expands authority.

1. **Pause via API** (brand owner scope):
   `PATCH /api/agent/autonomy/rollout` with
   `{ "rolloutId": "<uuid>", "reason": "<why, 3-500 chars>" }`.
   List active rollouts first with `GET /api/agent/autonomy/rollout`.
   A `409` means the rollout is not active or belongs to another brand.
2. **Pause server-side** if the API is unavailable: call
   `pauseAutonomyRollout(scope, rolloutId, reason)` from
   `src/lib/agent/autonomy-rollout.ts`.
3. **Verify enforcement**: `evaluateAutonomyPolicy` must deny autonomous
   actions for the paused rollout; `authorizeAgentAutonomyAction` is the
   runtime chokepoint for dispatch.
4. **Roll back schema changes** by reverting `src/lib/db/schema` and running
   `pnpm db:push` (push-based sync; the squashed baseline in
   `drizzle/migrations/` is review evidence, not a deploy artifact).
5. **Record the incident**: capture the stop condition that fired, link traces,
   and file a finding in `evals/claudia/security/red-team-v1.json` if the cause
   is a control failure. Resuming requires re-passing the eval gate for the
   stage being re-entered.

## Emergency stop exercise

Before any live stage (5+), rehearse: pause an active rollout, confirm denial
telemetry, reconstruct the incident from traces, and restore the prior
autonomy level. These are the `requiredProductionLikeExercises` in
`evals/claudia/rollouts/phase8-v1.json`.
