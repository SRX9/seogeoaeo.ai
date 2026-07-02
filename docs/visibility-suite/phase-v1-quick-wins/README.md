# Phase V1 — Quick wins (lead-gen)

High-value, low-cost, **mostly deterministic** checks. Ship first — they power the public
"check your site" tool and convert visitors.

> Read [`../00-principles.md`](../00-principles.md) first. Depends on Phase V0.

## Tickets

- [ ] ⚙️ [V1.1 — AI crawler access analyzer](v1.1-crawler-access.md)
- [ ] ⚙️ [V1.2 — Content Signals checker](v1.2-content-signals.md)
- [ ] ⚙️ [V1.3 — llms.txt analyzer & generator](v1.3-llms-txt.md)
- [ ] ⚙️ [V1.4 — Meta tags & Open Graph auditor](v1.4-meta-audit.md)
- [ ] ⚙️ [V1.5 — 60-second quick snapshot](v1.5-quick-snapshot.md)

## Phase exit criteria

- A logged-in user **and** the public landing tool can enter a URL and get crawler access +
  Content Signals + llms.txt + meta results + a quick score within seconds — all deterministic.
- `/api/visibility/quick` is rate-limited and cached by domain.
