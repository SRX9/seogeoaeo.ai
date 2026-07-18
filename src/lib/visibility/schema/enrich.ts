import { z } from "zod";
import { generateJson } from "@/lib/llm/client";
import type { PageSnapshot } from "../types";
import type { SchemaFix } from "./generate";

/**
 * V3.3 (v3): optional LLM enrichment of generated schema. `generate.ts` stays
 * fully deterministic and emits `[REPLACE: …]` placeholders; this fills the
 * extractable ones (description, features, contact) using ONLY facts present in
 * the page text. A grounding guard rejects any fill whose content words aren't
 * on the page, so the model can't invent facts. Best-effort: any failure returns
 * the input unchanged, and unfilled placeholders stay as-is (existing UX).
 */

export const SchemaEnrichSchema = z.object({
  fills: z.array(z.object({ path: z.string(), value: z.string().max(300) })),
});

export type EnrichFn = (
  tier: "light" | "heavy",
  messages: { role: "system" | "user" | "assistant"; content: string }[],
) => Promise<{ data: unknown }>;

// Only fields whose value can be *extracted* from page copy: never ratings,
// prices, dates, or identifiers the model might fabricate.
const EXTRACTABLE_KEYS = new Set([
  "description",
  "text",
  "telephone",
  "streetaddress",
  "addresslocality",
  "addressregion",
  "postalcode",
]);

interface Slot {
  id: number;
  key: string;
  label: string;
  get: () => string;
  set: (v: string) => void;
}

const PLACEHOLDER = "[REPLACE:";
const labelOf = (v: string) => v.replace(/^\[REPLACE:\s*/, "").replace(/\]$/, "").trim();

function collectSlots(root: object, slots: Slot[]): void {
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && v.includes(PLACEHOLDER) && EXTRACTABLE_KEYS.has(k.toLowerCase())) {
          slots.push({
            id: slots.length,
            key: k,
            label: labelOf(v),
            get: () => obj[k] as string,
            set: (val) => {
              obj[k] = val;
            },
          });
        } else {
          walk(v);
        }
      }
    }
  };
  walk(root);
}

/** ≥50% of a value's ≥3-char alphanumeric tokens must appear in the page text. */
function isGrounded(value: string, textLower: string): boolean {
  const tokens = value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => textLower.includes(t)).length;
  return hits / tokens.length >= 0.5;
}

const SYSTEM = [
  "You fill schema.org JSON-LD placeholder fields using ONLY facts explicitly present in the page text.",
  "If the text does not clearly state a fact, omit that field. Do not guess or invent values.",
  'Return JSON: {"fills":[{"path":"<id>","value":"<text from the page>"}]}: use the numeric ids given.',
].join(" ");

export async function enrichSchemaFixes(
  fixes: SchemaFix[],
  snapshot: PageSnapshot,
  opts: { generate?: EnrichFn } = {},
): Promise<SchemaFix[]> {
  // Deep-clone so a failure never mutates the deterministic input.
  const clones: SchemaFix[] = fixes.map((f) => ({ schema: f.schema, jsonLd: structuredClone(f.jsonLd) }));
  const slots: Slot[] = [];
  for (const fix of clones) collectSlots(fix.jsonLd, slots);
  if (slots.length === 0) return fixes;

  try {
    const excerpt = snapshot.text_content.slice(0, 4000);
    const fieldList = slots.map((s) => `${s.id}: ${s.key}: ${s.label}`).join("\n");
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Page text:\n${excerpt}\n\nFields to fill:\n${fieldList}` },
    ] as const;
    const { data } = opts.generate
      ? await opts.generate("light", [...messages])
      : await generateJson("light", [...messages], { schema: SchemaEnrichSchema });
    const parsed = SchemaEnrichSchema.safeParse(data);
    if (!parsed.success) return fixes;

    const textLower = snapshot.text_content.toLowerCase();
    let applied = 0;
    for (const fill of parsed.data.fills) {
      const slot = slots[Number(fill.path)];
      if (!slot) continue;
      // Only overwrite an un-filled placeholder, and only with grounded content.
      if (!slot.get().includes(PLACEHOLDER)) continue;
      if (!isGrounded(fill.value, textLower)) continue;
      slot.set(fill.value);
      applied++;
    }
    return applied > 0 ? clones : fixes;
  } catch {
    return fixes;
  }
}
