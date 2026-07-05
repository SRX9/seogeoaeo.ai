/**
 * Visibility scorer version. Bumped whenever a deterministic scoring change
 * makes new audits non-comparable to stored ones, so the delta tracker
 * (`compare.ts`) can caveat cross-version comparisons instead of attributing a
 * methodology change to the site. Persisted on each audit (`audits.scorer_version`).
 *
 * Changelog:
 *  - v1/v2: original port of the `inspiration-code` heuristics.
 *  - v3: citability proper-noun counting excludes single sentence-initial words;
 *        content blocks newline-joined so the structural bonus fires; real
 *        off-site brand signals (Reddit/YouTube/web) replace sameAs-only inference;
 *        true rendered-DOM SSR check; LLM semantic annotations on findings.
 */
export const SCORER_VERSION = 3;
