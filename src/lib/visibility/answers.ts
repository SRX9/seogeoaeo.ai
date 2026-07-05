import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brandProfiles, brands, competitors } from "@/lib/db/schema/brand";
import { answerRuns, trackedPrompts } from "@/lib/db/schema/visibility";
import type { Finding } from "./types";

/**
 * V5.5 — AI answer tracking (share-of-answer). Ask the real answer engines a set
 * of tracked prompts and record whether the brand — and its competitors — appear
 * in the answer text (mention) or the returned sources (citation). Share-of-answer
 * is computed from stored runs. Mention/citation detection is deterministic and
 * unit-tested; engine adapters degrade gracefully (one engine down ≠ run failed).
 */

export type EngineName = "chatgpt" | "perplexity" | "gemini";
export const ENGINES: EngineName[] = ["chatgpt", "perplexity", "gemini"];

export interface EngineAnswer {
  text: string;
  citations: string[];
}
export type AskEngine = (prompt: string) => Promise<EngineAnswer | null>;

// ── deterministic detection ──────────────────────────────────────────────────
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Common multi-part public suffixes, so mybrand.co.uk resolves to mybrand.co.uk
// (not the bare "co.uk", which would match every site on that suffix).
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "co.jp", "com.au", "net.au", "org.au",
  "co.nz", "com.br", "co.in", "co.za", "com.mx", "com.sg", "co.kr", "com.tr",
]);

export function apexDomain(input: string): string {
  try {
    const host = new URL(input.includes("://") ? input : `https://${input}`).hostname.toLowerCase();
    const parts = host.replace(/^www\./, "").split(".");
    if (parts.length <= 2) return parts.join(".");
    const lastTwo = parts.slice(-2).join(".");
    return MULTI_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
  } catch {
    return input.toLowerCase();
  }
}

/** Name variants for mention matching: lowercased, no-space, hyphenated. */
export function nameVariants(name: string): string[] {
  const n = name.trim().toLowerCase();
  return [...new Set([n, n.replace(/\s+/g, ""), n.replace(/\s+/g, "-")])].filter((v) => v.length >= 2);
}

export function detectMention(text: string, variants: string[]): boolean {
  const lower = text.toLowerCase();
  return variants.some((v) => new RegExp(`(^|[^a-z0-9])${escapeRe(v)}([^a-z0-9]|$)`, "i").test(lower));
}

export function detectCitation(citations: string[], domain: string): boolean {
  const apex = apexDomain(domain);
  return citations.some((c) => apexDomain(c) === apex);
}

// ── share computation ────────────────────────────────────────────────────────
export interface EngineShare {
  engine: EngineName;
  prompts: number;
  appeared: number;
  cited: number;
  share: number;
}

export function computeShare(
  runs: { engine: EngineName; brandMentioned: boolean; brandCited: boolean }[],
): EngineShare[] {
  return ENGINES.map((engine) => {
    const rows = runs.filter((r) => r.engine === engine);
    const appeared = rows.filter((r) => r.brandMentioned || r.brandCited).length;
    const cited = rows.filter((r) => r.brandCited).length;
    return {
      engine,
      prompts: rows.length,
      appeared,
      cited,
      share: rows.length ? Math.round((appeared / rows.length) * 100) : 0,
    };
  }).filter((s) => s.prompts > 0);
}

/**
 * Most recent stored answer excerpts for a brand, across engines. Used as
 * competitor-discovery evidence: brands the engines already name in category
 * answers are the truest competitors for AI visibility.
 */
export async function recentAnswerExcerpts(brandId: string, limit = 9): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ excerpt: answerRuns.answerExcerpt })
    .from(answerRuns)
    .where(eq(answerRuns.brandId, brandId))
    .orderBy(desc(answerRuns.ranAt))
    .limit(limit);
  return rows.map((r) => r.excerpt).filter((e): e is string => Boolean(e));
}

// ── engine adapters (best-effort; null on missing key / failure) ─────────────
const askChatGPT: AskEngine = async (prompt) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.ANSWER_OPENAI_MODEL || "gpt-5.4-nano-2026-03-17", tools: [{ type: "web_search" }], input: prompt }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { output_text?: string; output?: unknown[] };
    const citations: string[] = [];
    let text = data.output_text ?? "";
    for (const item of data.output ?? []) {
      for (const c of (item as { content?: unknown[] }).content ?? []) {
        const part = c as { text?: string; annotations?: { type?: string; url?: string }[] };
        if (part.text) text += part.text;
        for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) citations.push(a.url);
      }
    }
    return { text, citations };
  } catch {
    return null;
  }
};

const askPerplexity: AskEngine = async (prompt) => {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.ANSWER_PERPLEXITY_MODEL || "sonar", messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    return { text: data.choices?.[0]?.message?.content ?? "", citations: data.citations ?? [] };
  } catch {
    return null;
  }
};

const askGemini: AskEngine = async (prompt) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.ANSWER_GEMINI_MODEL || "gemini-3.1-flash-lite"}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] } }[];
    };
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const citations = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web?.uri)
      .filter((u): u is string => !!u);
    return { text, citations };
  } catch {
    return null;
  }
};

const DEFAULT_ASK: Record<EngineName, AskEngine> = {
  chatgpt: askChatGPT,
  perplexity: askPerplexity,
  gemini: askGemini,
};

// ── orchestration ────────────────────────────────────────────────────────────
export interface AnswerCell {
  promptId: string;
  prompt: string;
  engine: EngineName;
  brandMentioned: boolean;
  brandCited: boolean;
  competitors: { name: string; mentioned: boolean; cited: boolean }[];
  excerpt: string;
}

export interface AnswerRunResult {
  cells: AnswerCell[];
  share: EngineShare[];
  findings: Finding[];
}

function buildFindings(cells: AnswerCell[]): Finding[] {
  const findings: Finding[] = [];
  for (const cell of cells) {
    if (cell.brandMentioned || cell.brandCited) continue;
    const rival = cell.competitors.find((c) => c.cited || c.mentioned);
    if (!rival) continue;
    findings.push({
      pillar: "geo",
      category: "answer_share",
      severity: "high",
      title: `${cell.engine} names ${rival.name}, not you`,
      recommendation: `For "${cell.prompt}", ${cell.engine} surfaces ${rival.name}. Publish a stronger, more citable answer page for this query.`,
      fix_capability: "guided",
      fix_payload: { kind: "answer_gap", prompt: cell.prompt, engine: cell.engine, competitor: rival.name },
    });
  }
  return findings;
}

/**
 * Run every active tracked prompt through each engine, persist the runs, and
 * return the per-engine share plus fix-queue findings for misses.
 */
export async function runAnswerCheck(
  brandId: string,
  opts: { askImpl?: Partial<Record<EngineName, AskEngine>>; engines?: EngineName[] } = {},
): Promise<AnswerRunResult> {
  const db = getDb();
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) throw new Error("Brand not found");
  const profile = await db.query.brandProfiles.findFirst({ where: eq(brandProfiles.brandId, brandId) });
  const domain = profile?.website ? apexDomain(profile.website) : "";
  const comps = await db.select().from(competitors).where(eq(competitors.brandId, brandId));
  const prompts = await db
    .select()
    .from(trackedPrompts)
    .where(and(eq(trackedPrompts.brandId, brandId), eq(trackedPrompts.active, true)));

  const engines = opts.engines ?? ENGINES;
  const ask = { ...DEFAULT_ASK, ...opts.askImpl };
  const brandVars = nameVariants(brand.name);
  const compMeta = comps.map((c) => ({ name: c.name, variants: nameVariants(c.name), domain: apexDomain(c.url) }));

  const cells: AnswerCell[] = [];
  const rows: (typeof answerRuns.$inferInsert)[] = [];

  // Fire every prompt × engine call concurrently — they're independent external
  // requests. A thrown adapter is isolated to its own cell (null = engine down).
  const tasks = prompts.flatMap((p) => engines.map((engine) => ({ p, engine })));
  const answers = await Promise.all(
    tasks.map(({ p, engine }) =>
      ask[engine](p.prompt).then(
        (ans) => ({ p, engine, ans }),
        () => ({ p, engine, ans: null as EngineAnswer | null }),
      ),
    ),
  );

  for (const { p, engine, ans } of answers) {
    if (!ans) continue; // engine down — skip this cell, run still succeeds
    const brandMentioned = detectMention(ans.text, brandVars);
    const brandCited = !!domain && detectCitation(ans.citations, domain);
    const competitorsFlags = compMeta.map((c) => ({
      name: c.name,
      mentioned: detectMention(ans.text, c.variants),
      cited: detectCitation(ans.citations, c.domain),
    }));
    rows.push({
      brandId,
      promptId: p.id,
      engine,
      answerExcerpt: ans.text.slice(0, 500),
      brandMentioned,
      brandCited,
      mentions: competitorsFlags,
    });
    cells.push({ promptId: p.id, prompt: p.prompt, engine, brandMentioned, brandCited, competitors: competitorsFlags, excerpt: ans.text.slice(0, 300) });
  }

  if (rows.length) await db.insert(answerRuns).values(rows);

  return {
    cells,
    share: computeShare(rows.map((r) => ({ engine: r.engine as EngineName, brandMentioned: !!r.brandMentioned, brandCited: !!r.brandCited }))),
    findings: buildFindings(cells),
  };
}
