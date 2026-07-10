# Claudia Agent OS V2

## Product, UX, and autonomy plan

**Status:** Implemented (2026-07-10); broader live-site capabilities remain capability-gated
**North star:** A business owner hires an autonomous employee who continuously improves the
brand's visibility in Google, answer engines, and AI assistants, while researching, writing,
publishing, measuring, and improving content with very little owner input.

This plan evolves the current Agent OS without discarding the visibility engine, content engine,
publishing adapters, setup run, recurring workflows, proof stack, or Workshop. The next version
changes how those systems are composed and controlled.

Two product decisions are settled:

1. **Remove the sidebar entirely.** Primary navigation becomes a small floating bottom dock.
2. **Do not make the product chat-first.** Claudia remains a visual, ambient, work-oriented
   experience. Natural-language steering is a secondary control, not the product canvas.

---

## 1. Product thesis

The product is not an SEO dashboard with an AI assistant attached. It is an employee with a
workshop behind her.

The default surface must answer four owner questions, in this order:

1. **What is Claudia doing?**
2. **Is her work improving the business?**
3. **Does she need anything from me?**
4. **What will she do next?**

The owner should not be required to understand the tool catalog, audit taxonomy, job orchestration,
credit ledger, or SEO/AEO/GEO terminology to get value. Those systems remain available as evidence
and advanced controls, but they do not define the day-to-day experience.

The recurring owner actions remain:

- **Connect** a data source or destination when it unlocks meaningful work.
- **Approve** an exceptional or risky action Claudia cannot safely take alone.
- **Steer** priorities, constraints, or business goals when desired.

Everything else belongs to Claudia.

---

## 2. Experience principles

### 2.1 Visual and ambient, not chat-first

The home experience is a living work surface, not a conversation transcript. It uses state,
progress, artifacts, timelines, proof, and concise first-person briefings to communicate agency.

Natural language is used for high-leverage steering:

- “Focus on enterprise buyers this month.”
- “Do not publish competitor comparison pages.”
- “Prioritize AI-answer visibility over article volume.”
- “Pause WordPress publishing until Monday.”
- “Why did you choose this topic?”

These instructions should change Claudia's plan, permissions, or memory. They should not merely
generate advice in a chat bubble.

### 2.2 Honest presence

Claudia must never appear busy simply because automation is enabled or because she completed work
earlier that day. Presence is derived from real execution state.

Supported states:

| State | Meaning | Visual treatment |
| --- | --- | --- |
| Working now | A task is actively executing | Quiet animated Claudia mark and live task progress |
| On duty | Autonomous loop enabled, no task in flight | Static mark and next scheduled action |
| Waiting for you | A decision or connection blocks useful work | Attention state with exactly one primary action |
| Scheduled | Work is planned for a specific time | Static mark with next-run time |
| Paused | Plan, credits, or owner choice prevents work | Calm paused state with reason |
| Needs attention | A workflow failed and cannot self-recover | Clear recovery action without fake activity |

Animation represents real state change, not personality decoration.

### 2.3 One dominant story per screen

Avoid a dashboard made of equally weighted cards. Each surface gets one dominant purpose:

- Claudia: her work, plan, and proof.
- Inbox: exceptions requiring the owner.
- Reports: completed business outcomes over time.
- Brand: identity, connections, permissions, and advanced Workshop access.

### 2.4 Progressive disclosure

The owner sees the outcome first, then the reason, then evidence, then technical detail.

Example:

1. “I improved your structured data on five articles.”
2. “This gives AI assistants clearer product and author context.”
3. Show affected pages and score movement.
4. Offer the exact JSON-LD diff and action log only when expanded.

### 2.5 Correction is cheaper than configuration

Claudia derives brand, market, audience, competitors, query themes, and initial priorities. The
owner reviews one consolidated operating brief instead of completing a long setup questionnaire.

### 2.6 Autonomy must be inspectable and reversible

Every material action answers:

- What did Claudia change?
- Why did she choose it?
- What did she expect to happen?
- What evidence was used?
- Can it be reverted?
- Did it work?

---

## 3. Navigation: floating bottom dock

### 3.1 Primary dock

Remove HeroUI's persistent `Sidebar` and replace it with a floating dock centered at the bottom of
the viewport.

The dock contains four destinations:

| Item | Route | Purpose |
| --- | --- | --- |
| Claudia | `/dashboard` | Home, current mission, work, proof, and steering |
| Inbox | `/inbox` | Only decisions, approvals, and connections requiring the owner |
| Reports | `/reports` | Weekly briefings and outcome history |
| Brand | `/settings` | Brand knowledge, permissions, connections, billing, and Workshop |

Workshop routes are not added to the dock. They remain available under Brand → Workshop, from
artifact deep links, and through a keyboard command menu for power users.

### 3.2 Dock behavior

- Floating rounded material with four icon-and-label destinations.
- Maximum width sized to content rather than spanning the screen.
- Centered on desktop and mobile.
- Respects `env(safe-area-inset-bottom)` on mobile.
- Page content reserves enough bottom padding so nothing is obscured.
- Current destination uses a quiet sliding/filled indicator.
- Claudia's item may show a small state dot, but the dock never continuously pulses.
- Inbox shows a count only when owner action is genuinely required.
- Labels remain visible; icons alone are insufficient for primary navigation.
- The dock may compact slightly during downward scrolling, but it must not disappear.
- Keyboard focus, tooltips, and screen-reader labels are required.

### 3.3 Supporting chrome

The sidebar currently carries brand selection, agent status, theme, account, and navigation. These
responsibilities move as follows:

- **Brand capsule:** small floating control at the top-left containing the active brand and switcher.
- **Agent status:** shown inside Claudia's home hero, not globally repeated on every page.
- **Account/theme/billing:** inside the Brand surface and account menu opened from the brand capsule.
- **Mobile menu:** removed; the dock is already the mobile navigation.
- **Workshop context:** compact top breadcrumb with “Back to Claudia” rather than a full-width banner.

### 3.4 Navigation rule

Primary navigation should help owners orient themselves without making navigation feel like the
job. Four destinations are enough. Any fifth primary destination must replace an existing one,
not expand the dock.

---

## 4. Claudia home: a visual employee workspace

The home is not a collection of dashboard widgets and not a chat page. It is a responsive visual
briefing that changes composition based on Claudia's state.

### 4.1 Home hierarchy

#### A. Presence and current mission

One dominant hero communicates:

- Claudia's truthful state.
- The current business mission.
- The active task or next scheduled task.
- Why that task is currently the best use of time.

Example:

> **Working on your enterprise comparison opportunity**  
> I found that competitors appear in 8 of 12 tracked AI answers while you appear in 3. I’m
> building an evidence-backed comparison page and updating three supporting articles.

The hero is not a generic greeting. “Hi, here's where things stand” is replaced by an actual
working context whenever one exists.

#### B. Now / Next / Waiting

A compact visual plan shows:

- **Now:** the active task and its current step.
- **Next:** the next one or two planned tasks.
- **Waiting:** an owner dependency, only when one exists.

This is a plan, not a Kanban board. It should feel like checking an employee's desk, not managing
their ticket queue.

#### C. Proof story

Keep the three-layer proof stack, but connect proof to work:

1. Visibility score and delta.
2. AI-answer share and delta.
3. Real traffic and conversions from connected analytics.

Instead of three isolated KPI tiles, use one visual outcome narrative with a small trend and
annotations for meaningful actions:

- “Schema updates applied”
- “Comparison article published”
- “Answer share increased”
- “Search clicks began rising”

This makes causality visible without pretending certainty where only correlation exists.

#### D. Needs you

Show only exceptions that genuinely require the owner. Rank them by blocked value, not merely by
technical severity.

Each item contains:

- What Claudia needs.
- What work is blocked.
- Expected benefit of resolving it.
- One primary action.
- A defer option.

When empty, use a quiet line—“Nothing needed from you”—instead of a large empty-state card.

#### E. Work and output

Recent work is shown as a visual narrative timeline with created artifacts:

- Article written or published.
- Site change prepared or applied.
- Audit completed.
- Competitor or query opportunity discovered.
- Outcome verified or strategy changed.

Technical job rows, credit spends, retry controls, and raw logs remain in Workshop.

### 4.2 State-responsive compositions

The home composition changes rather than forcing every section to render in every state.

#### New brand

- Setup Run becomes the hero.
- Steps appear as Claudia's work, not user onboarding tasks.
- Proof sections progressively fill as results arrive.
- Connect cards enter Waiting only when they unlock the next material step.

#### Working now

- Active mission and live task dominate.
- Progress updates stream into the same task surface.
- Proof and history stay below.

#### On duty / caught up

- Latest briefing and outcome trend dominate.
- Next scheduled plan is visible.
- No fake animation.

#### Waiting for owner

- The blocked task and required decision move directly below the hero.
- Everything Claudia can continue without the owner remains active.

#### Paused or failed

- State the exact reason and effect.
- Offer one recovery action.
- Never display “working,” “live,” or breathing activity motion.

---

## 5. Steering Claudia without becoming chat-first

### 5.1 Replace “Ask me” with “Steer Claudia”

Remove the always-visible blank question box from the default home flow.

Provide a compact “Steer Claudia” action in the hero or near the current plan. It opens a focused
bottom sheet or centered command surface. It is not a persistent chat sidebar and does not turn the
home into message history.

### 5.2 Supported steering classes

| Class | Example | Result |
| --- | --- | --- |
| Priority | “Focus on enterprise leads.” | Updates mission priorities and replans queued work |
| Constraint | “Never publish pricing comparisons.” | Stores a durable prohibition used by research and writing |
| Permission | “You may update article metadata automatically.” | Proposes or changes an authority policy |
| Scheduling | “Pause publishing until Monday.” | Creates a time-bounded operating constraint |
| Direction | “Write about this product launch next.” | Adds a high-priority task with provenance |
| Explanation | “Why are you doing this?” | Explains the current decision with evidence |
| Status | “What changed this week?” | Opens or summarizes the visual report |

### 5.3 Response behavior

The response should usually be a structured result rather than a long chat answer:

- **Plan updated:** show what moved and why.
- **Constraint remembered:** show scope and duration.
- **Approval needed:** show the exact new authority being requested.
- **Task created:** show where it entered Now/Next.
- **Explanation:** show evidence sources and confidence.

Conversation history is retained for memory and audit purposes, but it is not the primary product
surface. Relevant decisions appear in the mission, plan, settings, or activity record where they
belong.

### 5.4 Guardrail

Do not build a general-purpose chatbot. If a request does not relate to the active brand, Claudia's
responsibilities, or a supported business action, respond briefly and redirect to supported work.

---

## 6. Onboarding redesign

The current one-question-at-a-time flow is more pleasant than a form but still asks the owner to
move through too many screens. V2 compresses onboarding into three moments.

### Moment 1: Give Claudia the site

Required input:

- Website URL.

Optional:

- Brand name only if it cannot be derived confidently.

Claudia immediately begins reading the site, discovering the business, audience, voice,
competitors, existing content, technical state, and likely buyer questions.

### Moment 2: Review the operating brief

Show one consolidated, editable summary:

- What the brand sells.
- Who it serves.
- How it should sound.
- Main competitors.
- Initial visibility gaps.
- First-week plan.

The owner can accept everything or correct individual assumptions inline. Topics, personas, and
competitors do not each require a separate screen.

### Moment 3: Set authority and start

Ask only:

- Autopilot or Copilot.
- Connect publishing and analytics now or later.
- Choose plan/start trial when required.

Then start Setup Run. The user lands on the visual working state and can leave immediately.

---

## 7. Agent architecture required to support the UX

The current recurring workflows remain executors. Add an agent coordination layer above them.

### 7.1 Closed loop

```
Observe → Prioritize → Plan → Authorize → Act → Verify → Learn → Brief
```

- **Observe:** audits, answer runs, GSC, GA4, competitors, published-content performance.
- **Prioritize:** evaluate expected impact, urgency, confidence, effort, risk, and owner goals.
- **Plan:** create a versioned weekly plan and ordered task graph.
- **Authorize:** apply per-category permissions and risk policy.
- **Act:** execute existing audit, research, writing, publishing, and fix machinery.
- **Verify:** re-audit or inspect external outcomes.
- **Learn:** update strategy weights and decision memory.
- **Brief:** generate owner-facing visual narrative from structured events.

### 7.2 Durable records

Add structured persistence instead of relying only on job type, status, message, and generic
metadata.

#### `agent_missions`

- Brand objective.
- Target metric or qualitative success condition.
- Horizon.
- Priority.
- Status.
- Origin: inferred, owner-directed, or system-created.

#### `agent_plan_versions`

- Mission reference.
- Weekly planning window.
- Plan rationale.
- Evidence snapshot.
- Version and superseded version.
- Reason for replanning.

#### `agent_tasks`

- Parent mission and plan.
- Task type and executor.
- Dependencies.
- Expected impact and confidence.
- Risk level.
- Required authority.
- Status, schedule, attempt, and idempotency key.
- Artifact or outcome reference.

#### `agent_events`

Append-only events:

- Planned.
- Started.
- Progressed.
- Artifact created.
- Approval requested.
- Applied.
- Verified.
- Regressed.
- Blocked.
- Replanned.
- Completed or failed.

This event stream becomes the source for live presence, Now/Next/Waiting, work history, and reports.

#### `agent_memory`

- Confirmed brand facts.
- Owner preferences.
- Prohibitions and constraints.
- Corrections to inferred facts.
- Confidence and provenance.
- Scope and expiry for temporary instructions.

#### `agent_approvals`

- Proposed action.
- Exact affected resource.
- Before/after diff.
- Risk and expected benefit.
- Decision and actor.
- Expiration or supersession state.

#### `agent_action_ledger`

- Before-state.
- Applied change.
- Remote reference.
- Rollback handle.
- Verification result.
- Outcome attribution.

### 7.3 Planner rules

- Use deterministic policy for authority, budgets, cadence, safety, and idempotency.
- Use model reasoning for prioritization, synthesis, and explaining tradeoffs.
- Never allow an LLM to bypass the authority policy.
- A new owner constraint triggers a plan diff, not a complete untraceable rewrite.
- Every task must link to a mission or an explicit maintenance obligation.
- Every plan change records why it happened.

---

## 8. Making Autopilot real

Autopilot currently has two different capability levels:

- Article publishing can be automatic through existing connectors.
- Customer-site SEO fixes are prepared, but not generally applied to the live site.

Until live application exists, product copy must state this distinction precisely.

### 8.1 Site-control plane

Introduce connector capability discovery rather than a single global auto-apply flag.

Example capabilities:

- `article.create`
- `article.update`
- `article.meta.update`
- `article.schema.update`
- `site.meta.update`
- `site.schema.update`
- `robots.update`
- `llms_txt.update`
- `rollback.supported`

The UI offers Live-apply only when the active connection declares the exact required capability.

### 8.2 Safe rollout order

1. Update Claudia-created articles through WordPress and Ghost.
2. Update metadata and structured data on those owned articles.
3. Add a generic signed site-agent/plugin protocol for safe file and metadata changes.
4. Add hosted or connector-specific `llms.txt` and crawler controls.
5. Expand to broader site changes only after rollback and verification are proven.

Every live action requires:

- Capability check.
- Policy check.
- Before-state capture.
- Validated patch.
- Idempotent application.
- Action log.
- Revert support where the connector allows it.
- Follow-up verification.

Off-site reputation work remains guided; the product must not claim Claudia can directly control
Wikipedia, Reddit, YouTube, third-party editorial sites, or AI-engine answers.

---

## 9. Visual direction

The current glass/material system can remain as a base, but V2 should reduce the feeling of a grid
of floating SaaS cards.

### Keep

- Calm translucent materials.
- Cal Sans/Inter hierarchy.
- Quiet press feedback.
- Reduced-motion support.
- Claudia's abstract identity rather than a human portrait.

### Change

- Use one dominant canvas per page instead of many equal panels.
- Reserve stronger depth for active work, approvals, and overlays.
- Make timelines and plan relationships spatially clear.
- Use restrained color to distinguish work, proof, attention, and success.
- Tie Claudia motion to genuine execution state.
- Use small transitions for task progression and plan changes, not decorative loops.

### Avoid

- Human avatar, fake face, or uncanny employee portrait.
- Full-screen chat transcript.
- Fake typing indicators.
- Permanent pulsing “working” states.
- More KPI tiles.
- Sci-fi HUD decoration that reduces readability.
- Hiding evidence in pursuit of magic.

The desired feeling is a calm, capable colleague—not a game character and not a chatbot.

---

## 10. Page-level target state

### `/dashboard` — Claudia

- No traditional page header reading “Claudia.”
- Dynamic presence/mission hero.
- Now/Next/Waiting plan.
- Visual proof story.
- Contextual owner exception.
- Recent work and artifacts.
- Secondary “Steer Claudia” action.

### `/inbox`

- One ranked list of owner-required exceptions.
- Group by decision, connection, or review—not by internal engine.
- Show blocked value and one primary action.
- Batch approval only for genuinely equivalent, low-risk actions.

### `/reports`

- Weekly briefing archive.
- Each report opens as a visual narrative, not raw metrics.
- Show plan, work, proof, lessons, and next-week direction.

### `/settings` — Brand

- Brand knowledge.
- How Claudia works.
- Connections.
- Permissions and action history.
- Billing/account.
- Workshop entry.

### Workshop routes

- Preserve advanced routes and direct links.
- Replace the large Workshop banner with compact contextual chrome.
- Keep the floating dock visible so the owner can always return to Claudia.
- Raw job data, credits, retries, tools, queues, and editors live here.

---

## 11. Responsive behavior

### Desktop

- Floating dock centered at the bottom.
- Content uses a focused reading width; visual evidence may expand wider.
- Brand capsule top-left.
- Steering opens as a centered command surface or bottom sheet.

### Mobile

- Same four-item dock; no separate hamburger navigation.
- Safe-area padding is mandatory.
- Hero and plan become a vertical sequence.
- Now/Next/Waiting remains readable without horizontal scrolling.
- Steering and approvals use bottom sheets.
- Minimum 44px touch targets.

### Accessibility

- Dock labels are always programmatically available and preferably visible.
- Active route uses more than color alone.
- Motion respects reduced-motion and never carries unique information.
- Live progress uses polite announcements rather than repeated assertive updates.
- All action diffs and evidence remain keyboard accessible.

---

## 12. Implementation phases

### Phase 0 — Truth and terminology

**Goal:** Make the current promise accurate before expanding the UI.

- Separate Working now, On duty, Scheduled, Waiting, Paused, and Needs attention.
- Animate Claudia only for actual in-flight work.
- Remove stale auto-apply expectations while live site capability is disabled.
- Clarify Autopilot copy: automatic content publishing versus prepared site fixes.
- Ensure Inbox count includes only owner-required actions.

**Exit criteria:** No surface claims Claudia is working or has applied a site change unless the
underlying execution record proves it.

### Phase 1 — Floating dock shell

**Goal:** Remove the sidebar without losing orientation or power-user access.

- Replace the current AppLayout/Sidebar composition.
- Build the four-item floating dock.
- Add brand capsule and account access.
- Add safe-area and bottom-content spacing.
- Convert Workshop banner to compact breadcrumb chrome.
- Verify every existing route remains reachable.

**Exit criteria:** Primary owners can move among Claudia, Inbox, Reports, and Brand in one action;
Workshop remains reachable within two actions.

### Phase 2 — Visual Claudia home

**Goal:** Make the home feel like checking on an employee rather than opening a dashboard.

- Build state-responsive mission hero.
- Add Now/Next/Waiting.
- Reframe proof as an annotated outcome story.
- Collapse Needs you to true exceptions.
- Reframe activity as work and artifacts.
- Remove the always-visible Ask box.

**Exit criteria:** A user understands Claudia's state, current work, outcome, dependency, and next
action without navigating or typing.

### Phase 3 — Mission, task, and event spine

**Goal:** Give the visual experience a durable autonomous model.

- Add missions, plan versions, tasks, events, memory, approvals, and action ledger.
- Wrap existing workflows as task executors.
- Derive live status and work stream from events.
- Generate the briefing from structured task/outcome data.

**Exit criteria:** Every work item belongs to a mission or maintenance duty and has a traceable
reason, authority decision, and outcome.

### Phase 4 — Steering surface

**Goal:** Let owners direct Claudia without turning the product into chat.

- Add focused Steer Claudia sheet.
- Support priority, constraint, permission, schedule, direction, explanation, and status intents.
- Show plan diffs and permission changes structurally.
- Persist durable and expiring memory.
- Add command-menu access for expert routes and actions.

**Exit criteria:** Supported natural-language instructions change structured product state; chat
history is not required to understand the resulting plan.

### Phase 5 — Site-control plane

**Goal:** Make site-fix autonomy real where connectors permit it.

- Add connector capability discovery.
- Ship safe updates for Claudia-created WordPress/Ghost content first.
- Add before/after diff, rollback, and verification.
- Expose Live-apply only for proven capability-action pairs.

**Exit criteria:** Claudia can apply, log, verify, and where supported revert at least one valuable
class of live SEO improvement on a customer site.

### Phase 6 — Outcome-driven replanning

**Goal:** Move from scheduled automation to adaptive autonomous work.

- Reprioritize using GSC, GA4, answer share, competitor gaps, and article checkpoints.
- Promote winning topic families.
- Rescue or stop weak strategies.
- Attribute outcomes conservatively.
- Explain plan changes in the weekly report.

**Exit criteria:** Claudia demonstrably changes her future work based on measured results and can
explain the change.

---

## 13. Initial implementation file map

### Shell and navigation

- Replace sidebar logic in `src/components/layout/app-shell.tsx`.
- Add `src/components/layout/floating-agent-dock.tsx`.
- Add `src/components/layout/brand-capsule.tsx`.
- Simplify `src/components/layout/workshop-banner.tsx` into compact Workshop context.
- Add dock, safe-area, and page-bottom primitives in `src/app/globals.css`.

### Claudia home

- Recompose `src/app/(app)/dashboard/page.tsx`.
- Evolve `src/components/dashboard/claudia-hero.tsx` into mission/presence hero.
- Replace `src/components/dashboard/ask-claudia.tsx` with a secondary
  `steer-claudia.tsx` surface.
- Evolve `proof-strip.tsx` into an annotated outcome story.
- Evolve `approval-inbox.tsx` toward one ranked exception surface.
- Evolve `work-stream.tsx` to consume task/event records and show artifacts.

### Agent model

- Add schema under `src/lib/db/schema/` for missions, plans, tasks, events, memory, approvals,
  and actions.
- Add `src/lib/agent/planner.ts`.
- Add `src/lib/agent/policy.ts` or extend the existing fix policy into a general authority policy.
- Add `src/lib/agent/events.ts`.
- Add `src/lib/agent/memory.ts`.
- Add `src/lib/agent/steer.ts`.
- Keep existing setup, daily, audit, research, writing, and reporting workflows as executors.

### APIs

- Add `/api/agent/state` for mission, presence, Now/Next/Waiting, and proof annotations.
- Add `/api/agent/steer` for structured steering and plan diffs.
- Add `/api/agent/approvals` for owner decisions.
- Prefer event-backed granular queries; avoid one enormous dashboard endpoint.

---

## 14. Acceptance criteria

### Navigation

- No persistent sidebar or mobile hamburger exists in the authenticated product shell.
- Floating dock contains exactly four primary destinations.
- All primary destinations are reachable in one action.
- Workshop is reachable within two actions and never promoted to the dock.
- Content is never hidden behind the dock at any supported viewport.

### Home

- No empty chat input is shown by default.
- The first viewport communicates truthful state, active mission/task, and next action.
- If owner action is required, the blocked value and one action are visible.
- If no owner action is required, the interface says so quietly.
- Proof is presented with delta and context, never as a bare score.

### Agent behavior

- Every visible “working” state maps to an in-flight task/event.
- Every task has a reason and mission or maintenance obligation.
- Every owner steering instruction produces a structured state change or a clear unsupported result.
- Every live action has an authority decision and action ledger entry.
- Every auto-applied action has a verification outcome.

### Interaction burden

- New onboarding requires no more than site, operating-brief confirmation, authority, and plan.
- Day-to-day value is visible without typing or opening Workshop.
- Owner-required actions are exceptions, not recurring operation steps.

---

## 15. Success metrics

Measure whether owners can rely on Claudia rather than whether they explore tools.

### Activation

- Time from signup to Setup Run start.
- Time to first audit, first tracked AI-answer result, first prepared fix, and first article.
- Percentage accepting the inferred operating brief with zero or minor edits.

### Autonomy

- Percentage of useful tasks completed without owner input.
- Owner actions required per active brand per week.
- Percentage of tasks blocked by missing capability, permission, or connection.
- Auto-applied action success, verification, regression, and rollback rates.

### Trust

- Approval acceptance and defer rates.
- Percentage of actions opened for evidence or diff inspection.
- False or stale “working” state incidents.
- Owner corrections to remembered facts and constraints.

### Outcomes

- Visibility score delta.
- AI-answer share delta.
- Search clicks and qualified traffic delta.
- Published-content performance by topic family.
- Verified fixes that remain fixed on later audits.

### Product simplicity

- Percentage of active sessions completed entirely on Claudia home.
- Workshop usage by owner segment rather than as a universal requirement.
- Navigation actions per successful owner outcome.
- Inbox items per week and median time to resolve genuinely blocking items.

High Workshop usage from technical users is healthy. High Workshop usage from ordinary brand
owners because Claudia cannot complete her job is a product failure.

---

## 16. Non-goals

- Rebuilding the analyzer or content engines solely for this UX change.
- Removing advanced tools or evidence.
- Building a general-purpose conversational assistant.
- Adding a human avatar or voice persona as a substitute for autonomy.
- Claiming control over third-party/off-site surfaces.
- Exposing live-apply before capability, rollback, and verification exist.
- Adding more primary navigation items.
- Optimizing for time spent in the app; a good autonomous employee should reduce required app time.

---

## 17. Final product definition

Claudia Agent OS V2 succeeds when a business owner can open the product, understand in seconds what
their employee is doing and whether it is working, handle at most one meaningful exception, and
leave confident that the work will continue without them.

The floating dock makes the product easy to navigate. The visual home makes the employee legible.
The mission and event spine makes the employee real. The site-control plane makes autonomy useful.
Outcome-driven replanning makes the system improve rather than merely repeat.
