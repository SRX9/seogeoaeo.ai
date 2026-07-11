import { parseHTML } from "linkedom";
import { DEFAULT_HEADERS } from "./fetch-page";
import type { Finding, LlmsTxtResult } from "./types";

/**
 * V0.2: llms.txt probe. Port of `fetch_llms_txt()` from
 * `inspiration-code/scripts/fetch_page.py`: existence + raw content only
 * (validation is ticket V1.3).
 */
export async function fetchLlmsTxt(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<LlmsTxtResult> {
  const { origin } = new URL(url);
  const fetchImpl = opts.fetchImpl ?? fetch;

  const result: LlmsTxtResult = {
    llms_txt: { url: `${origin}/llms.txt`, exists: false, content: "" },
    llms_full_txt: { url: `${origin}/llms-full.txt`, exists: false, content: "" },
    errors: [],
  };

  for (const file of [result.llms_txt, result.llms_full_txt]) {
    try {
      const response = await fetchImpl(file.url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      if (response.status === 200) {
        file.exists = true;
        file.content = await response.text();
      }
    } catch (error) {
      result.errors.push(
        `Error checking ${file.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

/**
 * V1.3: llms.txt validation. Format checks + suggestion logic ported from
 * `inspiration-code/scripts/llmstxt_generator.py` → `validate_llmstxt()`;
 * score bands from `agents/geo-ai-visibility.md` → Step 4.
 */

export interface LlmsTxtValidation {
  url: string;
  exists: boolean;
  format_valid: boolean;
  has_title: boolean;
  has_description: boolean;
  has_sections: boolean;
  has_links: boolean;
  section_count: number;
  link_count: number;
  issues: string[];
  suggestions: string[];
  full_version: { url: string; exists: boolean };
  /** Band: 0 absent · 30 malformed · 50 minimal · 70 covers primary areas · 90 comprehensive + full. */
  score: number;
  findings: Finding[];
}

/** Pure analysis of an already-fetched V0.2 `LlmsTxtResult` (zero requests). */
export function analyzeLlmsTxt(fetched: LlmsTxtResult): LlmsTxtValidation {
  const result: LlmsTxtValidation = {
    url: fetched.llms_txt.url,
    exists: fetched.llms_txt.exists,
    format_valid: false,
    has_title: false,
    has_description: false,
    has_sections: false,
    has_links: false,
    section_count: 0,
    link_count: 0,
    issues: [],
    suggestions: [],
    full_version: { url: fetched.llms_full_txt.url, exists: fetched.llms_full_txt.exists },
    score: 0,
    findings: [],
  };

  if (fetched.llms_txt.exists) {
    const content = fetched.llms_txt.content;
    const lines = content.trim().split("\n");

    result.has_title = lines.length > 0 && lines[0].startsWith("# ");
    if (!result.has_title) {
      result.issues.push("Missing title (should start with '# Site Name')");
    }

    result.has_description = lines.some((l) => l.startsWith("> "));
    if (!result.has_description) {
      result.issues.push("Missing description (use '> Brief description')");
    }

    result.section_count = lines.filter((l) => l.startsWith("## ")).length;
    result.has_sections = result.section_count > 0;
    if (!result.has_sections) {
      result.issues.push("No sections found (use '## Section Name')");
    }

    result.link_count = (content.match(/- \[.+\]\(.+\)/g) ?? []).length;
    result.has_links = result.link_count > 0;
    if (!result.has_links) {
      result.issues.push("No page links found (use '- [Page Title](url): Description')");
    }

    result.format_valid =
      result.has_title && result.has_description && result.has_sections && result.has_links;

    if (result.link_count < 5) {
      result.suggestions.push("Consider adding more key pages (aim for 10-20)");
    }
    if (result.section_count < 2) {
      result.suggestions.push("Add more sections to organize content types");
    }
    const lower = content.toLowerCase();
    if (!lower.includes("contact")) {
      result.suggestions.push("Add a Contact section with email and location");
    }
    if (!lower.includes("key fact") && !lower.includes("about")) {
      result.suggestions.push("Add key facts about your business/service");
    }
  }

  // Score bands (deterministic reading of Step 4's rubric)
  if (!result.exists) {
    result.score = 0;
  } else if (!result.format_valid) {
    result.score = 30;
  } else if (result.link_count < 5 || result.section_count < 2) {
    result.score = 50;
  } else if (result.link_count >= 10 && result.full_version.exists) {
    result.score = 90;
  } else {
    result.score = 70;
  }

  if (!result.exists) {
    result.findings.push({
      pillar: "geo",
      category: "llms_txt",
      severity: "high",
      title: "No llms.txt found",
      recommendation:
        "Publish /llms.txt so AI models know your most important pages and how to describe you.",
      fix_capability: "artifact",
    });
  } else if (!result.format_valid) {
    result.findings.push({
      pillar: "geo",
      category: "llms_txt",
      severity: "medium",
      title: "llms.txt is malformed",
      recommendation: result.issues.join("; "),
      fix_capability: "artifact",
    });
  } else if (result.suggestions.length > 0) {
    result.findings.push({
      pillar: "geo",
      category: "llms_txt",
      severity: "low",
      title: "llms.txt could be more complete",
      recommendation: result.suggestions.join("; "),
      fix_capability: "guided",
    });
  }

  return result;
}

/** GET /llms.txt (+ probe /llms-full.txt) and validate against the spec. */
export async function validateLlmsTxt(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<LlmsTxtValidation> {
  return analyzeLlmsTxt(await fetchLlmsTxt(url, opts));
}

/**
 * V1.3: llms.txt generator. Port of `generate_llmstxt()` from
 * `inspiration-code/scripts/llmstxt_generator.py`, including the 5-bucket
 * keyword map and the SSRF guard (skip cross-origin URLs in the full version).
 */

const SECTION_KEYWORDS: [section: string, keywords: string[]][] = [
  ["Products & Services", ["/pricing", "/feature", "/product", "/solution", "/demo"]],
  [
    "Resources & Blog",
    ["/blog", "/article", "/resource", "/guide", "/learn", "/docs", "/documentation"],
  ],
  ["Company", ["/about", "/team", "/career", "/contact", "/press", "/partner"]],
  ["Support", ["/help", "/support", "/faq", "/status"]],
];

const SKIP_EXTENSIONS = [".pdf", ".jpg", ".png", ".gif", ".css", ".js"];

const SECTION_ORDER = [
  "Main Pages",
  "Products & Services",
  "Resources & Blog",
  "Company",
  "Support",
] as const;

export interface LlmsTxtGeneration {
  llms_txt: string;
  llms_full_txt: string;
  pages_analyzed: number;
  sections: Record<string, number>;
  /** Carries the generated files as a machine-applicable fix (V7.2). */
  finding: Finding | null;
  error?: string;
}

function metaDescription(document: ReturnType<typeof parseHTML>["document"]): string {
  return (
    document.querySelector('meta[name="description"]')?.getAttribute("content") ?? ""
  );
}

export async function generateLlmsTxt(
  url: string,
  opts: {
    maxPages?: number;
    /** Reuse an already-fetched homepage HTML (V0.1 snapshot): zero extra requests. */
    homepageHtml?: string;
    /** Fetch each page's meta description for llms-full.txt (default true). */
    includeFull?: boolean;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<LlmsTxtGeneration> {
  const maxPages = opts.maxPages ?? 30;
  const includeFull = opts.includeFull ?? true;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = new URL(url);
  const baseUrl = `${base.protocol}//${base.host}`;

  const result: LlmsTxtGeneration = {
    llms_txt: "",
    llms_full_txt: "",
    pages_analyzed: 0,
    sections: {},
    finding: null,
  };

  let html = opts.homepageHtml;
  if (html === undefined) {
    try {
      const response = await fetchImpl(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(30_000),
      });
      html = await response.text();
    } catch (error) {
      result.error = `Failed to fetch homepage: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
  }
  const { document } = parseHTML(html);

  const titleText = document.querySelector("title")?.textContent?.trim() ?? "";
  const siteName = titleText
    ? titleText.split("|")[0].split("-")[0].trim() || base.host
    : base.host;
  const siteDescription = metaDescription(document) || `Official website of ${siteName}`;

  const pages: Record<string, { url: string; title: string }[]> = Object.fromEntries(
    SECTION_ORDER.map((s) => [s, []]),
  );

  const seen = new Set<string>();
  for (const link of document.querySelectorAll("a[href]")) {
    const linkText = link.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (linkText.length < 2) continue;

    let resolved: URL;
    try {
      resolved = new URL(link.getAttribute("href") ?? "", baseUrl);
    } catch {
      continue;
    }
    const href = resolved.toString();
    if (resolved.host !== base.host) continue;
    if (seen.has(href)) continue;
    if (SKIP_EXTENSIONS.some((ext) => href.includes(ext))) continue;
    if (href.includes("#") && seen.has(href.split("#")[0])) continue;

    seen.add(href);
    const path = resolved.pathname.toLowerCase();
    const entry = { url: href, title: linkText };

    const section = SECTION_KEYWORDS.find(([, keywords]) =>
      keywords.some((kw) => path.includes(kw)),
    )?.[0];
    if (section) {
      pages[section].push(entry);
    } else if (path === "/" || path === "" || path.includes("/home") || path.includes("/index")) {
      if (href !== baseUrl && href !== baseUrl + "/") pages["Main Pages"].push(entry);
    } else {
      pages["Main Pages"].push(entry);
    }

    if (seen.size >= maxPages) break;
  }

  result.pages_analyzed = seen.size;
  result.sections = Object.fromEntries(
    Object.entries(pages).map(([section, entries]) => [section, entries.length]),
  );

  const header = [`# ${siteName}`, `> ${siteDescription}`, ""];
  const contact = ["## Contact", `- Website: ${baseUrl}`, `- Email: contact@${base.host}`, ""];

  // Concise version: top 10 links per section
  const concise = [...header];
  for (const section of SECTION_ORDER) {
    if (pages[section].length === 0) continue;
    concise.push(`## ${section}`);
    for (const page of pages[section].slice(0, 10)) {
      concise.push(`- [${page.title}](${page.url})`);
    }
    concise.push("");
  }
  concise.push(...contact);
  result.llms_txt = concise.join("\n");

  // Full version: all links, with each page's meta description where fetchable
  const full = [...header];
  for (const section of SECTION_ORDER) {
    if (pages[section].length === 0) continue;
    full.push(`## ${section}`);
    for (const page of pages[section]) {
      // Skip cross-origin URLs to prevent SSRF via redirect chains
      if (new URL(page.url).host !== base.host || !includeFull) {
        full.push(`- [${page.title}](${page.url})`);
        continue;
      }
      let description = "";
      try {
        const response = await fetchImpl(page.url, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(10_000),
        });
        description = metaDescription(parseHTML(await response.text()).document);
      } catch {
        // best-effort: fall back to a bare link
      }
      full.push(
        description
          ? `- [${page.title}](${page.url}): ${description}`
          : `- [${page.title}](${page.url})`,
      );
    }
    full.push("");
  }
  full.push(...contact);
  result.llms_full_txt = full.join("\n");

  result.finding = {
    pillar: "geo",
    category: "llms_txt",
    severity: "high",
    title: "No llms.txt found",
    recommendation:
      "Publish the generated /llms.txt (and /llms-full.txt) so AI models know your most important pages.",
    fix_capability: "artifact",
    fix_payload: {
      kind: "llms_txt",
      llms_txt: result.llms_txt,
      llms_full_txt: includeFull ? result.llms_full_txt : null,
    },
  };

  return result;
}
