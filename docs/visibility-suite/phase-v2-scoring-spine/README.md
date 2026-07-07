# Phase V2 — Scoring spine

The reproducible **core IP** (citability) plus the **hero composite score** (unified audit).

> Read [`../00-principles.md`](../00-principles.md) first. Depends on Phase V0.

## Tickets

- [ ] ⚙️ [V2.1 — AI citability / passage scorer (flagship)](v2.1-citability-scorer.md)
- [ ] ⚙️🧠 [V2.2 — Technical SEO auditor + SSR + CWV](v2.2-technical-auditor.md)
- [ ] ⚙️ [V2.3 — Unified audit + composite score](v2.3-unified-audit.md)

## Phase exit criteria

- A full audit returns a real composite 0–100 score with citability + technical sub-scores, a
  severity-ranked findings list, and a draft 30-day action plan.
- The citability scorer has unit tests **locking the algorithm** (same HTML → same score).
