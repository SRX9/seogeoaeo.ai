import type { PageSnapshot } from "../types";

/**
 * V3.1: structured-data detector. JSON-LD is already parsed server-side by
 * V0.1 into `snapshot.structured_data` (WebFetch strips `<head>`, which is why
 * `fetch_page.py`/V0.1 fetch raw HTML). This also scans the raw HTML for
 * Microdata and RDFa. Ports `agents/geo-schema.md` Step 1.
 */

export type SchemaFormat = "json-ld" | "microdata" | "rdfa";

export interface SchemaBlock {
  format: SchemaFormat;
  /** All @type values in the block (handles arrays + @graph nodes). */
  types: string[];
  /** Parsed object for JSON-LD; null for Microdata/RDFa. */
  raw: unknown;
  /** Present in the server HTML (JSON-LD from raw HTML is always true). */
  inRawHtml: boolean;
}

export interface DetectionResult {
  blocks: SchemaBlock[];
  formats: SchemaFormat[];
  types: string[];
  /** CSR site with schema not in raw HTML → invisible to AI crawlers (Step 6). */
  jsInjectionRisk: boolean;
}

function typeOf(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const t = (node as Record<string, unknown>)["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string");
  return [];
}

/** Collect @type from a JSON-LD block, descending into a top-level @graph. */
function extractTypes(block: unknown): string[] {
  const types = typeOf(block);
  const graph = (block as Record<string, unknown>)?.["@graph"];
  if (Array.isArray(graph)) {
    for (const node of graph) types.push(...typeOf(node));
  }
  return types;
}

function detectMicrodata(html: string): SchemaBlock[] {
  const blocks: SchemaBlock[] = [];
  for (const m of html.matchAll(/itemtype\s*=\s*["']([^"']*schema\.org[^"']*)["']/gi)) {
    const type = m[1].split("/").filter(Boolean).pop() ?? m[1];
    blocks.push({ format: "microdata", types: [type], raw: null, inRawHtml: true });
  }
  return blocks;
}

function detectRdfa(html: string): SchemaBlock[] {
  // RDFa only counts when a schema.org vocab is declared (avoids false positives).
  if (!/vocab\s*=\s*["'][^"']*schema\.org/i.test(html)) return [];
  const blocks: SchemaBlock[] = [];
  for (const m of html.matchAll(/typeof\s*=\s*["']([^"']+)["']/gi)) {
    blocks.push({ format: "rdfa", types: [m[1]], raw: null, inRawHtml: true });
  }
  return blocks;
}

export function detectSchema(snapshot: PageSnapshot): DetectionResult {
  const blocks: SchemaBlock[] = [];

  for (const entry of snapshot.structured_data ?? []) {
    blocks.push({
      format: "json-ld",
      types: extractTypes(entry),
      raw: entry,
      inRawHtml: true,
    });
  }
  blocks.push(...detectMicrodata(snapshot.html), ...detectRdfa(snapshot.html));

  const formats = [...new Set(blocks.map((b) => b.format))];
  const types = [...new Set(blocks.flatMap((b) => b.types))];
  // If the page is client-rendered and no schema survives in raw HTML, any
  // JS-injected schema is invisible to AI crawlers.
  const jsInjectionRisk = !snapshot.has_ssr_content && blocks.length === 0;

  return { blocks, formats, types, jsInjectionRisk };
}
