# Phase V8 — Product surface & monetization

The user-facing layer that packages the V0–V7 engine: the Visibility dashboard, the fix
queue, the Toolbox (standalone tool pages for technical users), credit metering, and
Claudia's visibility duties.

> Read [`../00-principles.md`](../00-principles.md) **and** [`../01-product-surface.md`](../01-product-surface.md)
> first. This phase does NOT run last — see "When to build what" below; its tickets interleave
> with the engine phases.

## Tickets

- [ ] ⚙️ [V8.1 — Visibility dashboard page](v8.1-visibility-dashboard.md)
- [ ] ⚙️ [V8.2 — Fix queue](v8.2-fix-queue.md)
- [ ] ⚙️ [V8.3 — Toolbox (standalone tool pages)](v8.3-toolbox.md)
- [ ] ⚙️ [V8.4 — Credit metering for visibility jobs](v8.4-credit-metering.md)
- [ ] 🧠 [V8.5 — Claudia visibility agent (monitor → propose → auto-apply)](v8.5-claudia-visibility-agent.md)
- [ ] ⚙️ [V8.6 — Growth funnel (public tools → signup → first audit)](v8.6-growth-funnel.md)

## When to build what

| Ticket | Build right after | Why |
|---|---|---|
| V8.4 metering | V0.3 (audit workflow exists) | Nothing user-triggerable ships unmetered |
| V8.1 dashboard | V2.3 (composite score exists) | The hero number needs the audit to produce it |
| V8.2 fix queue | V2.3 | First real findings to rank; grows richer with every later phase |
| V8.6 funnel | V1.5 + V8.1 (free tools can start after V1) | The funnel is the acquisition loop; first audit free needs a dashboard to land on |
| V8.3 Toolbox | V3 (enough tools: V1.1–V1.4, V2.1–V2.2, V3.1–V3.3) | A Toolbox with 3 tools looks dead; with ~9 it looks like a product |
| V8.5 agent | V7.2 + V7.3 (auto-apply + scheduled re-audits) | The agent's Level 1/2 powers are V7 machinery |

## Phase exit criteria

- Sidebar shows Visibility, Fix queue, and Toolbox; all pages follow the section-loading
  convention (instant shell, independent `<Section>` skeletons, granular endpoints).
- Every user-triggered visibility job spends declared credits through the ledger,
  idempotent by run id.
- A finding produced by any analyzer — via full audit, Toolbox run, or scheduled agent run —
  appears in the same fix queue with a working action button.
- Claudia's autonomy is configurable per category and every action she takes is visible in
  Activity.
