# Phase V3 — Schema engine

Detect → validate → **generate copy-paste JSON-LD**. The triple-pillar tool (SEO rich results,
AEO FAQ/speakable, GEO sameAs entity linking).

> Read [`../00-principles.md`](../00-principles.md) first. Depends on Phase V0.

## Tickets

- [ ] ⚙️🧠 [V3.1 — Schema detector & validator](v3.1-schema-detector.md)
- [ ] ⚙️ [V3.2 — Schema score & sameAs auditor](v3.2-schema-score-sameas.md)
- [ ] 🧠 [V3.3 — JSON-LD generator (FAQ/Speakable)](v3.3-jsonld-generator.md)

## Phase exit criteria

- Audit detects + validates existing schema, scores it 0–100, audits the sameAs graph, and emits
  **valid copy-paste JSON-LD** (Organization+sameAs, Article+Person, speakable, FAQ) tailored to
  the detected business type — stored as `fix_payload` for V7.2.
