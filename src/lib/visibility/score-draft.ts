import { analyzePageCitability, type PageCitability } from "./citability";
import { analyzeReadability, detectAiContent, type AiContentResult, type ReadabilityResult } from "./content";
import type { HeadingEntry, PageSnapshot } from "./types";

/**
 * V7.1: live editor scoring. Runs the SAME deterministic V2.1 citability +
 * V4.2 readability modules the audit uses, so the editor score always equals the
 * audit score for identical content. Fast, no LLM: safe to call on debounce.
 * The optional deep pass adds the V4.3 AI-content check (still deterministic).
 */

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Minimal Markdown → HTML so the audit's HTML-based analyzers can run on a draft. */
export function draftToHtml(markdown: string): string {
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${esc(para.join(" "))}</p>`);
    para = [];
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    const h = /^(#{1,6})\s+(.*)/.exec(line);
    if (h) {
      flush();
      out.push(`<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`);
    } else if (!line) {
      flush();
    } else {
      para.push(line.replace(/[*_`>#-]/g, "").trim());
    }
  }
  flush();
  return `<html><body>${out.join("")}</body></html>`;
}

function draftSnapshot(markdown: string, html: string): PageSnapshot {
  const headings: HeadingEntry[] = [];
  for (const m of markdown.matchAll(/^(#{1,6})\s+(.*)/gm)) {
    headings.push({ level: m[1].length, text: m[2].trim() });
  }
  const text = markdown.replace(/^#{1,6}\s+/gm, "").replace(/[*_`>#-]/g, " ").replace(/\s+/g, " ").trim();
  return {
    url: "draft://editor",
    status_code: 200,
    redirect_chain: [],
    headers: {},
    meta_tags: {},
    title: headings[0]?.text ?? null,
    description: null,
    canonical: null,
    h1_tags: headings.filter((h) => h.level === 1).map((h) => h.text),
    heading_structure: headings,
    word_count: text ? text.split(/\s+/).length : 0,
    text_content: text,
    internal_links: [],
    external_links: [],
    images: [],
    structured_data: [],
    has_ssr_content: true,
    security_headers: {},
    errors: [],
    html,
  };
}

export interface DraftScore {
  citability: PageCitability;
  readability: ReadabilityResult;
  aiContent?: AiContentResult;
}

/** Score a Markdown draft the way the audit would. `deep` adds AI-content. */
export function scoreDraft(markdown: string, opts: { deep?: boolean } = {}): DraftScore {
  const html = draftToHtml(markdown);
  const snapshot = draftSnapshot(markdown, html);
  const result: DraftScore = {
    citability: analyzePageCitability(html),
    readability: analyzeReadability(snapshot),
  };
  if (opts.deep) result.aiContent = detectAiContent(snapshot);
  return result;
}
