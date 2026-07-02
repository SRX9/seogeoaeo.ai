import { analyzeCrawlerAccess } from "./crawler-access";
import { DEFAULT_HEADERS } from "./fetch-page";
import { auditMeta } from "./meta-audit";
import type { Finding, PageSnapshot, RobotsResult } from "./types";

/**
 * V2.2 — technical SEO auditor. Ports `inspiration-code/agents/geo-technical.md`
 * Steps 1–9 + 11: a 0–100 score across 9 categories with SSR as the
 * highest-weight check (AI crawlers don't run JS), exact security-header
 * deductions, a static CWV risk estimate (INP, never FID), URL/mobile/response
 * checks. Reuses V1.4 meta + V1.1 crawler analyzers for those two categories so
 * the technical sub-score is the single SEO owner of their findings.
 */

export type SsrSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RiskLevel = "Low" | "Medium" | "High";

export interface TechnicalCategory {
  key: string;
  label: string;
  score: number;
  weight: number;
}

export interface TechnicalResult {
  score: number;
  categories: TechnicalCategory[];
  ssr: { severity: SsrSeverity; renderingType: string; framework: string };
  /** Static-HTML estimate — validate with field data (CrUX/PageSpeed). */
  cwv: { lcp: RiskLevel; inp: RiskLevel; cls: RiskLevel; note: string };
  findings: Finding[];
}

const WEIGHTS = {
  ssr: 0.25,
  meta: 0.15,
  crawlability: 0.15,
  security: 0.1,
  cwv: 0.1,
  mobile: 0.1,
  url: 0.05,
  response: 0.05,
  additional: 0.05,
} as const;

const LABELS: Record<keyof typeof WEIGHTS, string> = {
  ssr: "Server-Side Rendering",
  meta: "Meta Tags & Indexability",
  crawlability: "Crawlability",
  security: "Security Headers",
  cwv: "Core Web Vitals Risk",
  mobile: "Mobile Optimization",
  url: "URL Structure",
  response: "Response & Status",
  additional: "Additional Checks",
};

// ── SSR (Step 8, highest weight) ───────────────────────────────────────────
function detectFramework(html: string): { renderingType: string; framework: string } {
  if (/__NEXT_DATA__/.test(html)) return { renderingType: "SSR/SSG", framework: "Next.js" };
  if (/__NUXT__|__NUXT_DATA__/.test(html)) return { renderingType: "SSR/SSG", framework: "Nuxt" };
  if (/data-server-rendered/.test(html)) return { renderingType: "SSR", framework: "Vue (SSR)" };
  if (/data-reactroot/.test(html)) return { renderingType: "SSR", framework: "React (SSR)" };
  if (/wp-content|wp-includes/.test(html)) return { renderingType: "SSR", framework: "WordPress" };
  if (/<app-root/i.test(html)) return { renderingType: "CSR", framework: "Angular SPA" };
  if (/<div\s+id=["'](?:root|app)["']>\s*<\/div>/i.test(html))
    return { renderingType: "CSR", framework: "React/Vue SPA" };
  return { renderingType: "SSR", framework: "Unknown" };
}

function assessSsr(snapshot: PageSnapshot): { severity: SsrSeverity; renderingType: string; framework: string; score: number } {
  const detected = detectFramework(snapshot.html);
  let severity: SsrSeverity;
  if (!snapshot.has_ssr_content) severity = "CRITICAL";
  else if (detected.renderingType.startsWith("SSR")) severity = "LOW";
  else if (detected.renderingType === "CSR") severity = "MEDIUM";
  else severity = "LOW";
  const score = { LOW: 100, MEDIUM: 70, HIGH: 40, CRITICAL: 0 }[severity];
  return { severity, ...detected, score };
}

// ── Security (Step 4, exact deductions) ────────────────────────────────────
function scoreSecurity(snapshot: PageSnapshot): { score: number; missing: string[]; https: boolean } {
  const https = safeProtocol(snapshot.url) === "https:";
  const sh = snapshot.security_headers;
  const missing: string[] = [];
  let score = 100;
  if (!https) score -= 30;
  const deduct = (header: string, points: number) => {
    if (!sh[header]) {
      missing.push(header);
      score -= points;
    }
  };
  deduct("Strict-Transport-Security", 10);
  deduct("Content-Security-Policy", 10);
  deduct("X-Frame-Options", 5);
  deduct("X-Content-Type-Options", 5);
  deduct("Referrer-Policy", 5);
  deduct("Permissions-Policy", 3);
  return { score: Math.max(0, score), missing, https };
}

// ── CWV static risk estimate (Step 7, INP not FID) ─────────────────────────
const riskFromCount = (n: number): RiskLevel => (n === 0 ? "Low" : n <= 2 ? "Medium" : "High");
const vitalScore = (r: RiskLevel) => (r === "Low" ? 100 : r === "Medium" ? 60 : 25);

function assessCwv(snapshot: PageSnapshot) {
  const html = snapshot.html;
  const head = /<head[\s\S]*?<\/head>/i.exec(html)?.[0] ?? "";
  const headBlockingScripts = (head.match(/<script\b(?![^>]*\b(?:async|defer)\b)[^>]*\bsrc=/gi) ?? []).length;
  const blockingStyles = (head.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi) ?? []).filter(
    (l) => !/\bmedia=/i.test(l),
  ).length;
  const fontsNoDisplay = /@font-face/i.test(html) && !/font-display/i.test(html);
  const imgsNoDim = snapshot.images.filter((im) => !im.width || !im.height).length;
  const heroNoDim = snapshot.images.length > 0 && (!snapshot.images[0].width || !snapshot.images[0].height);

  let lcp = 0;
  if (headBlockingScripts > 0) lcp++;
  if (blockingStyles > 2) lcp++;
  if (fontsNoDisplay) lcp++;
  if (heroNoDim) lcp++;

  let inp = 0;
  if (headBlockingScripts > 2) inp++;
  if ((html.match(/<script\b/gi) ?? []).length > 15) inp++;
  if (/\bon(?:click|load|scroll|mouseover|change|submit)=/i.test(html)) inp++;

  let cls = 0;
  if (imgsNoDim > 0) cls++;
  if (imgsNoDim > 3) cls++;
  if ((html.match(/<iframe\b(?![^>]*\b(?:width|height)=)[^>]*>/gi) ?? []).length > 0) cls++;

  const risk = { lcp: riskFromCount(lcp), inp: riskFromCount(inp), cls: riskFromCount(cls) };
  const score = Math.round((vitalScore(risk.lcp) + vitalScore(risk.inp) + vitalScore(risk.cls)) / 3);
  return { ...risk, score };
}

// ── Mobile (Step 6) ────────────────────────────────────────────────────────
function scoreMobile(snapshot: PageSnapshot): number {
  const html = snapshot.html;
  const viewport = snapshot.meta_tags["viewport"] ?? "";
  let score = 0;
  if (viewport.includes("width=device-width")) score += 50;
  if (/@media\b/i.test(html) || /\b(?:flex|grid)\b/.test(html)) score += 20;
  if (/\bsrcset=/i.test(html) || /<picture[\s>]/i.test(html)) score += 15;
  if (viewport && !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/i.test(viewport)) score += 15;
  return Math.min(100, score);
}

// ── URL structure (Step 5) ─────────────────────────────────────────────────
function scoreUrl(url: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { score: 0, issues: ["Unparseable URL"] };
  }
  if (u.search) issues.push("query parameters");
  if (/[A-Z]/.test(u.pathname)) issues.push("uppercase characters");
  if (u.pathname.includes("_")) issues.push("underscores instead of hyphens");
  if (u.pathname.split("/").filter(Boolean).length > 4) issues.push("nesting deeper than 4 levels");
  if (url.length > 100) issues.push("longer than 100 characters");
  let weight = issues.length;
  if (/[0-9a-f]{16,}|sess(?:ion)?id=|[?&]sid=/i.test(url)) {
    issues.push("session ID or opaque token");
    weight += 2;
  }
  const score = weight === 0 ? 100 : weight === 1 ? 75 : weight <= 3 ? 50 : 30;
  return { score, issues };
}

// ── Response & status (Steps 1, 9) ─────────────────────────────────────────
function scoreResponse(snapshot: PageSnapshot): number {
  let score = 100;
  const status = snapshot.status_code ?? 0;
  if (status >= 400 || status === 0) score -= 50;
  if (snapshot.redirect_chain.length > 1) score -= 15;
  else if (snapshot.redirect_chain.length === 1) score -= 5;
  if (!/gzip|br|deflate/i.test(snapshot.headers["content-encoding"] ?? "")) score -= 15;
  if (!snapshot.headers["cache-control"]) score -= 10;
  return Math.max(0, score);
}

// ── Additional (Step 9) ────────────────────────────────────────────────────
function scoreAdditional(snapshot: PageSnapshot): { score: number; invalidJsonLd: boolean } {
  let score = 100;
  if (!snapshot.canonical) score -= 20;
  const invalidJsonLd = snapshot.errors.some((e) => e.includes("JSON-LD"));
  if (invalidJsonLd) score -= 20;
  if (!/rel=["'](?:preconnect|dns-prefetch|preload)["']/i.test(snapshot.html)) score -= 10;
  if (snapshot.redirect_chain.length > 1) score -= 10;
  return { score: Math.max(0, score), invalidJsonLd };
}

function safeProtocol(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return "";
  }
}

const SSR_SEVERITY_MAP = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low" } as const;

export function auditTechnical(
  snapshot: PageSnapshot,
  robots: RobotsResult,
  _sitemapPages: string[] = [],
): TechnicalResult {
  const meta = auditMeta(snapshot);
  const crawler = analyzeCrawlerAccess(robots);
  const ssr = assessSsr(snapshot);
  const security = scoreSecurity(snapshot);
  const cwv = assessCwv(snapshot);
  const mobile = scoreMobile(snapshot);
  const url = scoreUrl(snapshot.url);
  const response = scoreResponse(snapshot);
  const additional = scoreAdditional(snapshot);

  const rawScores: Record<keyof typeof WEIGHTS, number> = {
    ssr: ssr.score,
    meta: meta.score,
    crawlability: crawler.score,
    security: security.score,
    cwv: cwv.score,
    mobile: mobile,
    url: url.score,
    response,
    additional: additional.score,
  };

  const categories: TechnicalCategory[] = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map(
    (key) => ({ key, label: LABELS[key], score: rawScores[key], weight: WEIGHTS[key] }),
  );
  const score = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0),
  );

  // ── Findings: reuse meta + crawler; add technical-specific ones ──────────
  const findings: Finding[] = [...meta.findings, ...crawler.findings];

  if (ssr.severity !== "LOW") {
    findings.push({
      pillar: "geo",
      category: "ssr",
      severity: SSR_SEVERITY_MAP[ssr.severity],
      title:
        ssr.severity === "CRITICAL"
          ? "Page content requires JavaScript to render"
          : "Some content is only visible after JavaScript runs",
      recommendation:
        "AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't execute JavaScript. " +
        "Server-render or pre-render the main content so it's in the initial HTML.",
      fix_capability: "guided",
    });
  }
  if (!security.https) {
    findings.push({
      pillar: "seo",
      category: "security",
      severity: "critical",
      title: "Site is not served over HTTPS",
      recommendation: "Enable HTTPS — HTTP triggers browser warnings and a ranking penalty.",
      fix_capability: "guided",
    });
  }
  if (security.missing.length > 0) {
    findings.push({
      pillar: "seo",
      category: "security",
      severity: "low",
      title: `Missing security headers (${security.missing.length})`,
      recommendation: `Add: ${security.missing.join(", ")}. They protect users and signal trust.`,
      fix_capability: "guided",
    });
  }
  for (const [vital, level] of [
    ["LCP", cwv.lcp],
    ["INP", cwv.inp],
    ["CLS", cwv.cls],
  ] as const) {
    if (level === "High") {
      findings.push({
        pillar: "seo",
        category: "core_web_vitals",
        severity: "medium",
        title: `High ${vital} risk (static estimate)`,
        recommendation:
          `HTML signals suggest ${vital} may be slow. Validate with PageSpeed Insights / CrUX field data, then optimize.`,
        fix_capability: "guided",
      });
    }
  }
  if (url.score < 60) {
    findings.push({
      pillar: "seo",
      category: "url_structure",
      severity: "low",
      title: "URL structure could be cleaner",
      recommendation: `Issues: ${url.issues.join(", ")}. Prefer lowercase, hyphenated, shallow, keyword-rich URLs.`,
      fix_capability: "guided",
    });
  }
  if (additional.invalidJsonLd) {
    findings.push({
      pillar: "aeo",
      category: "structured_data",
      severity: "medium",
      title: "Invalid JSON-LD in the page source",
      recommendation: "Fix the malformed JSON-LD — search engines skip structured data that won't parse.",
      fix_capability: "guided",
    });
  }

  return {
    score,
    categories,
    ssr: { severity: ssr.severity, renderingType: ssr.renderingType, framework: ssr.framework },
    cwv: {
      lcp: cwv.lcp,
      inp: cwv.inp,
      cls: cwv.cls,
      note: "Static HTML estimate — validate with PageSpeed Insights or CrUX field data.",
    },
    findings,
  };
}

// ── V5.3 — Agent-readiness signals (non-scoring, never penalize) ────────────
export interface AgentReadiness {
  linkHeaders: { present: boolean; relTypes: string[]; recommendation?: string };
  markdown: { status: "supported" | "not-supported" | "error"; contentType?: string; recommendation?: string };
}

const HIGH_VALUE_RELS = ["api-catalog", "describedby", "service-doc", "mcp-server-card"];

/** Parse RFC 8288 `Link:` header rel types (no extra request). */
function parseLinkRels(header: string | undefined): string[] {
  if (!header) return [];
  const rels: string[] = [];
  for (const m of header.matchAll(/rel\s*=\s*"?([a-z0-9-]+)"?/gi)) rels.push(m[1].toLowerCase());
  return rels.filter((r) => HIGH_VALUE_RELS.includes(r));
}

function isApiFirst(snapshot: PageSnapshot): boolean {
  const urls = snapshot.internal_links.map((l) => l.url.toLowerCase()).join(" ");
  return /\/api\/|\/developers?\b|openapi|swagger/.test(urls) || /openapi|swagger/i.test(snapshot.html);
}

/**
 * Detect two emerging agentic-web signals: RFC 8288 `Link:` service discovery
 * (from V0.1 headers) and Markdown content negotiation (one extra request).
 * Bonuses/recommendations only — never affects any score (V5.3).
 */
export async function checkAgentReadiness(
  snapshot: PageSnapshot,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<AgentReadiness> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  const relTypes = parseLinkRels(snapshot.headers["link"]);
  const linkHeaders: AgentReadiness["linkHeaders"] = { present: relTypes.length > 0, relTypes };
  if (relTypes.length === 0 && isApiFirst(snapshot)) {
    linkHeaders.recommendation =
      "Add RFC 8288 Link headers (api-catalog, service-doc, mcp-server-card) so agents can discover your API.";
  }

  const markdown: AgentReadiness["markdown"] = { status: "error" };
  try {
    const res = await fetchImpl(snapshot.url, {
      headers: { ...DEFAULT_HEADERS, Accept: "text/markdown" },
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status === 200 && /text\/markdown/i.test(contentType)) {
      markdown.status = "supported";
      markdown.contentType = contentType;
    } else if (res.status === 200) {
      markdown.status = "not-supported";
      markdown.contentType = contentType;
      markdown.recommendation =
        "Serve Markdown via content negotiation (Accept: text/markdown) — a one-line config on Cloudflare Workers/Pages.";
    }
  } catch {
    // Non-200 / network error → skip, never penalize.
  }

  return { linkHeaders, markdown };
}
