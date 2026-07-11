import type { Pillar } from "./types";

/**
 * V8.3: client-safe Toolbox metadata (no analyzer imports, so it's bundle-safe
 * for the /tools grid). The server registry in `toolbox-registry.ts` pairs each
 * entry with its `run()`.
 */

export type ToolInputKind = "domain" | "url" | "page-or-text";
export type ToolCostKey = "tool_run_basic" | "tool_run_ai";

export interface ToolboxMeta {
  slug: string;
  name: string;
  pillar: Pillar | "cross";
  description: string;
  inputKind: ToolInputKind;
  costKey: ToolCostKey;
}

export const TOOLBOX_META: ToolboxMeta[] = [
  { slug: "crawler-access", name: "AI Crawler Access Analyzer", pillar: "geo", description: "Check whether AI assistants like ChatGPT and Perplexity are allowed to read your site.", inputKind: "domain", costKey: "tool_run_basic" },
  { slug: "content-signals", name: "Content Signals Checker", pillar: "geo", description: "See how your robots.txt tells AI systems they may use your content.", inputKind: "domain", costKey: "tool_run_basic" },
  { slug: "llms-txt", name: "llms.txt Analyzer & Generator", pillar: "geo", description: "Check (and generate) the AI site guide that tells assistants about your key pages.", inputKind: "domain", costKey: "tool_run_basic" },
  { slug: "meta-audit", name: "Meta & Open Graph Auditor", pillar: "seo", description: "Audit your title, description, canonical, and social preview tags.", inputKind: "url", costKey: "tool_run_basic" },
  { slug: "citability", name: "AI Citability / Passage Scorer", pillar: "aeo", description: "Score how quotable each section is for AI answers.", inputKind: "page-or-text", costKey: "tool_run_basic" },
  { slug: "technical-seo", name: "Technical SEO + SSR + CWV", pillar: "seo", description: "A 9-point technical health check with server-side-rendering and Core Web Vitals risk.", inputKind: "url", costKey: "tool_run_basic" },
  { slug: "schema-audit", name: "Schema Detector & Validator", pillar: "aeo", description: "Detect and validate your structured data and audit your sameAs entity graph.", inputKind: "url", costKey: "tool_run_basic" },
  { slug: "schema-generator", name: "JSON-LD Generator", pillar: "aeo", description: "Generate ready-to-paste JSON-LD for the schema your site is missing.", inputKind: "url", costKey: "tool_run_ai" },
];

export function getToolMeta(slug: string): ToolboxMeta | undefined {
  return TOOLBOX_META.find((t) => t.slug === slug);
}
