/**
 * V5.5: seed tracked prompts from the brand profile, topic backlog, and (once
 * available) PAA questions. Deterministic; the user edits/adds/disables the list
 * and plan caps the count.
 */

export interface PromptSeedInput {
  category?: string;
  audience?: string;
  useCases?: string[];
  competitors?: string[];
  name?: string;
  paa?: string[];
}

export function suggestPrompts(input: PromptSeedInput, max = 10): string[] {
  const { category, audience, useCases = [], competitors = [], name, paa = [] } = input;
  const out: string[] = [];
  const cat = category?.trim();

  if (cat) {
    out.push(audience ? `best ${cat} for ${audience}` : `best ${cat}`);
    out.push(`${cat} alternatives`);
    out.push(`top ${cat} tools`);
  }
  for (const uc of useCases.slice(0, 3)) out.push(`how do I ${uc.replace(/^how to /i, "").trim()}`);
  if (name) for (const c of competitors.slice(0, 3)) out.push(`${c} vs ${name}`);
  out.push(...paa);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of out) {
    const q = p.trim().replace(/\s+/g, " ");
    const key = q.toLowerCase();
    if (q.length < 5 || seen.has(key)) continue;
    seen.add(key);
    deduped.push(q);
  }
  return deduped.slice(0, max);
}
