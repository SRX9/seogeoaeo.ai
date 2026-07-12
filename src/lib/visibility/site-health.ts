import { analyzeCrawlerAccess } from "./crawler-access";
import { auditMeta } from "./meta-audit";
import { analyzeLlmsTxt } from "./llms";
import type { PsiResult } from "./pagespeed";
import type { RenderComparison } from "./render";
import { detectSchema } from "./schema/detect";
import { validateSchema } from "./schema/validate";
import { checkFavicon, checkOgImage, detectLogo } from "./site-checks";
import { auditTechnical } from "./technical";
import type { Finding, LlmsTxtResult, PageSnapshot, RobotsResult } from "./types";

/**
 * Site Health composer: one checklist of everything the site should pass to
 * max its visibility scores, built from the analyzers the audit already runs
 * (meta, technical, crawler, llms, schema) plus the net-new probes (PSI,
 * favicon, logo, og:image). Every warn/fail check embeds its `Finding` inline
 * so the page can always render a copy-paste AI prompt: even when the fix
 * queue deduped or the owner dismissed the matching row. Only the net-new
 * findings are RETURNED (the audit's analyzers persist their own).
 */

export type HealthStatus = "pass" | "warn" | "fail";

/** Keys of HEALTH_GROUP_LABELS in display.ts (labels live there: client-safe). */
export type HealthGroup =
  | "search_listing"
  | "social_preview"
  | "performance"
  | "crawler_access"
  | "structured_data"
  | "ai_readiness"
  | "security";

export interface HealthCheck {
  /** Stable slug, e.g. "meta.title", "psi.performance", "social.favicon". */
  id: string;
  group: HealthGroup;
  label: string;
  status: HealthStatus;
  /** Current state in owner language, e.g. "58 chars: within 50-60". */
  detail: string;
  /** Embedded on warn/fail: powers the inline copy-paste AI prompt. */
  finding?: Finding;
}

export interface SiteHealthSnapshot {
  version: 1;
  generatedAt: string;
  /** audit = computed by a visibility audit; refresh = manual recheck; agent = Claudia's weekly check. */
  source: "audit" | "refresh" | "agent";
  siteUrl: string;
  /** false → the Speed group is the static HTML estimate, not real PSI data. */
  psiAvailable: boolean;
  /** Lighthouse category scores (mobile), null without PSI. */
  scores: PsiResult["scores"] | null;
  checks: HealthCheck[];
  summary: { pass: number; warn: number; fail: number };
}

export interface SiteHealthInput {
  /** Homepage snapshot INCLUDING raw html (several checks read it). */
  homepage: PageSnapshot;
  robots: RobotsResult;
  llms: LlmsTxtResult;
  sitemapPageCount: number;
  render?: RenderComparison;
  psi: PsiResult | null;
  fetchImpl?: typeof fetch;
  /** How this snapshot was produced: stored on the snapshot; no silent default. */
  source: SiteHealthSnapshot["source"];
}

// Owner-language labels for the meta-audit checks we surface 1:1.
const META_CHECKS: Array<{ tag: string; group: HealthGroup; label: string; match: RegExp }> = [
  { tag: "title", group: "search_listing", label: "Page title", match: /title/i },
  { tag: "description", group: "search_listing", label: "Meta description", match: /description/i },
  { tag: "canonical", group: "search_listing", label: "Canonical link", match: /canonical/i },
  { tag: "robots", group: "search_listing", label: "Indexing allowed", match: /noindex/i },
  { tag: "viewport", group: "search_listing", label: "Mobile viewport", match: /viewport/i },
  { tag: "lang", group: "search_listing", label: "Language declared", match: /lang attribute/i },
  { tag: "open_graph", group: "social_preview", label: "Open Graph tags", match: /open graph/i },
  { tag: "twitter_card", group: "social_preview", label: "Twitter Card tags", match: /twitter card/i },
];

const guided = (
  pillar: Finding["pillar"],
  category: string,
  severity: Finding["severity"],
  title: string,
  recommendation: string,
): Finding => ({ pillar, category, severity, title, recommendation, fix_capability: "guided" });

const CRUX_LABELS = {
  lcp: "Loading speed (LCP)",
  inp: "Responsiveness (INP)",
  cls: "Layout stability (CLS)",
} as const;

const CRUX_FAIL_TITLES = {
  lcp: "Largest Contentful Paint fails Core Web Vitals",
  inp: "Interaction to Next Paint fails Core Web Vitals",
  cls: "Cumulative Layout Shift fails Core Web Vitals",
} as const;

export async function buildSiteHealth(
  input: SiteHealthInput,
): Promise<{ snapshot: SiteHealthSnapshot; findings: Finding[] }> {
  const { homepage, robots, llms, sitemapPageCount, render, psi, source } = input;
  const checks: HealthCheck[] = [];
  const newFindings: Finding[] = [];

  const meta = auditMeta(homepage);
  const technical = auditTechnical(homepage, robots, [], { render });
  const crawler = analyzeCrawlerAccess(robots);
  const llmsValidation = analyzeLlmsTxt(llms);
  const [favicon, ogImage] = await Promise.all([
    checkFavicon(homepage, input.fetchImpl),
    checkOgImage(homepage, input.fetchImpl),
  ]);
  const logo = detectLogo(homepage);

  // ── Search listing + social tags (from the V1.4 meta audit, 1:1) ──────────
  for (const spec of META_CHECKS) {
    const check = meta.checks.find((c) => c.tag === spec.tag);
    if (!check) continue;
    const status: HealthStatus =
      check.status === "present" ? "pass" : check.status === "issue" ? "warn" : "fail";
    checks.push({
      id: `meta.${spec.tag}`,
      group: spec.group,
      label: spec.label,
      status,
      detail: check.note ?? check.value ?? (status === "pass" ? "Set" : "Missing"),
      ...(status !== "pass"
        ? { finding: meta.findings.find((f) => spec.match.test(f.title)) }
        : {}),
    });
  }

  // ── Social preview probes (net-new findings) ───────────────────────────────
  if (ogImage.reachable !== null) {
    const reachableFinding = guided(
      "seo",
      "social_preview",
      "medium",
      "Social share image does not load",
      `The og:image URL (${ogImage.url}) did not return an image. Shared links on social platforms and in AI answers will show no preview: point og:image at a live image URL.`,
    );
    checks.push({
      id: "social.og_image_reachable",
      group: "social_preview",
      label: "Share image loads",
      status: ogImage.reachable ? "pass" : "fail",
      detail: ogImage.reachable
        ? "og:image returns a live image"
        : "og:image URL did not return an image",
      ...(ogImage.reachable ? {} : { finding: reachableFinding }),
    });
    if (!ogImage.reachable) newFindings.push(reachableFinding);

    const { declaredWidth: w, declaredHeight: h } = ogImage;
    if (ogImage.reachable && w != null && h != null) {
      const tooSmall = w < 200 || h < 200;
      const sizeFinding = guided(
        "seo",
        "social_preview",
        "low",
        "Social share image is too small",
        `og:image is declared as ${w}×${h}px. Platforms want at least 200×200 (1200×630 recommended): small images render as tiny thumbnails or get dropped.`,
      );
      checks.push({
        id: "social.og_image_size",
        group: "social_preview",
        label: "Share image size",
        status: tooSmall ? "warn" : "pass",
        detail: `${w}×${h}px${tooSmall ? ": below the 200px minimum" : ""}`,
        ...(tooSmall ? { finding: sizeFinding } : {}),
      });
      if (tooSmall) newFindings.push(sizeFinding);
    }
  }

  const faviconFinding: Finding = {
    pillar: "seo",
    category: "favicon",
    severity: "medium",
    title: "No favicon found",
    recommendation:
      "Google shows favicons next to every mobile result and AI browsers use them to identify your brand: add one and declare it with a <link rel=\"icon\"> tag.",
    fix_capability: "artifact",
    fix_payload: { kind: "meta_tag", tag: "icon", suggested: "/favicon.ico" },
  };
  checks.push({
    id: "social.favicon",
    group: "social_preview",
    label: "Favicon",
    status: favicon.reachable ? "pass" : "fail",
    detail: favicon.reachable
      ? favicon.declared
        ? "Declared and loads"
        : "/favicon.ico loads (not declared: fine)"
      : favicon.declared
        ? "Declared but the icon does not load"
        : "No icon declared and /favicon.ico is missing",
    ...(favicon.reachable ? {} : { finding: faviconFinding }),
  });
  if (!favicon.reachable) newFindings.push(faviconFinding);

  const logoFinding = guided(
    "geo",
    "brand_assets",
    "medium",
    "Brand logo is not declared in structured data",
    "Google Knowledge Panels and AI assistants pick your logo from Organization schema. Add a `logo` property to your Organization JSON-LD pointing at a square image of at least 112×112px.",
  );
  checks.push({
    id: "social.logo",
    group: "social_preview",
    label: "Brand logo",
    status: logo.source === "schema" ? "pass" : logo.source ? "warn" : "fail",
    detail:
      logo.source === "schema"
        ? "Declared in your Organization schema"
        : logo.source === "og_image"
          ? "Only guessable from og:image: declare it in schema"
          : logo.source === "header_img"
            ? "Found in the page header but not declared in schema"
            : "No logo found on the page or in schema",
    ...(logo.source === "schema" ? {} : { finding: logoFinding }),
  });
  if (logo.source !== "schema") newFindings.push(logoFinding);

  // ── Performance (real PSI when available, static estimate otherwise) ──────
  if (psi) {
    const perf = psi.scores.performance;
    if (perf != null) {
      const status: HealthStatus = perf < 50 ? "fail" : perf < 90 ? "warn" : "pass";
      const perfFinding: Finding = {
        pillar: "seo",
        category: "performance",
        severity: perf < 50 ? "high" : "medium",
        title: "Mobile page speed is below Google's bar",
        recommendation: `Lighthouse scores your page ${perf}/100 for performance on mobile. Slow pages rank lower and get abandoned: fix the measured issues, biggest savings first.`,
        fix_capability: "artifact",
        fix_payload: { kind: "psi_perf", score: perf, opportunities: psi.opportunities },
      };
      checks.push({
        id: "psi.performance",
        group: "performance",
        label: "Lighthouse performance",
        status,
        detail: `${perf}/100 (mobile)`,
        ...(status === "pass" ? {} : { finding: perfFinding }),
      });
      if (status !== "pass") newFindings.push(perfFinding);
    }

    for (const key of ["lcp", "inp", "cls"] as const) {
      const rating = psi.fieldData?.ratings[key];
      if (!rating) continue;
      const status: HealthStatus =
        rating === "SLOW" ? "fail" : rating === "AVERAGE" ? "warn" : "pass";
      const value =
        key === "cls"
          ? (psi.fieldData?.cls?.toFixed(2) ?? "Not available")
          : `${(((key === "lcp" ? psi.fieldData?.lcpMs : psi.fieldData?.inpMs) ?? 0) / 1000).toFixed(1)}s`;
      const fieldFinding: Finding = {
        pillar: "seo",
        category: "performance",
        severity: rating === "SLOW" ? "high" : "medium",
        title: CRUX_FAIL_TITLES[key],
        recommendation: `Real Chrome users measure ${CRUX_LABELS[key]} at ${value}: rated ${rating.toLowerCase()} by Google. Core Web Vitals are a ranking factor; fix the measured issues below.`,
        fix_capability: "artifact",
        fix_payload: { kind: "psi_perf", metric: key, value, opportunities: psi.opportunities },
      };
      checks.push({
        id: `psi.${key}_field`,
        group: "performance",
        label: CRUX_LABELS[key],
        status,
        detail: `${value}: ${rating.toLowerCase()} (real-user data)`,
        ...(status === "pass" ? {} : { finding: fieldFinding }),
      });
      if (status !== "pass") newFindings.push(fieldFinding);
    }

    const lighthouseExtras = [
      ["accessibility", psi.scores.accessibility, "Lighthouse accessibility", "Lighthouse flags accessibility issues"],
      ["best_practices", psi.scores.bestPractices, "Lighthouse best practices", "Lighthouse flags best-practice issues"],
      ["seo", psi.scores.seo, "Lighthouse SEO", "Lighthouse flags on-page SEO issues"],
    ] as const;
    for (const [key, score, label, title] of lighthouseExtras) {
      if (score == null) continue;
      const status: HealthStatus = score < 90 ? "warn" : "pass";
      const extraFinding = guided(
        "seo",
        "performance",
        "low",
        title,
        `Lighthouse scores your page ${score}/100 for ${label.replace("Lighthouse ", "")} on mobile. Run PageSpeed Insights on your URL to see the specific failing audits and fix them.`,
      );
      checks.push({
        id: `psi.${key}`,
        group: "performance",
        label,
        status,
        detail: `${score}/100 (mobile)`,
        ...(status === "pass" ? {} : { finding: extraFinding }),
      });
      if (status === "warn") newFindings.push(extraFinding);
    }
  } else {
    // No PSI: fall back to the static HTML risk estimate the audit already has.
    for (const key of ["lcp", "inp", "cls"] as const) {
      const risk = technical.cwv[key];
      const status: HealthStatus = risk === "High" ? "fail" : risk === "Medium" ? "warn" : "pass";
      checks.push({
        id: `cwv.${key}_estimate`,
        group: "performance",
        label: CRUX_LABELS[key],
        status,
        detail: `${risk} risk (static estimate)`,
        ...(status === "pass"
          ? {}
          : {
              finding: technical.findings.find(
                (f) =>
                  f.category === "core_web_vitals" &&
                  f.title.toLowerCase().includes(key === "lcp" ? "lcp" : key === "inp" ? "inp" : "cls"),
              ),
            }),
      });
    }
  }

  // ── Crawler access ─────────────────────────────────────────────────────────
  checks.push({
    id: "crawlers.robots_txt",
    group: "crawler_access",
    label: "robots.txt",
    status: robots.exists ? "pass" : "fail",
    detail: robots.exists ? "Found" : "Missing",
    ...(robots.exists
      ? {}
      : { finding: crawler.findings.find((f) => f.title === "No robots.txt found") }),
  });

  const blockedAi = crawler.crawlers.filter((c) => c.tier === 1 && c.blocked);
  checks.push({
    id: "crawlers.ai_access",
    group: "crawler_access",
    label: "AI crawlers allowed",
    status: blockedAi.length === 0 ? "pass" : "fail",
    detail:
      blockedAi.length === 0
        ? "GPTBot, ClaudeBot, PerplexityBot can read your site"
        : `Blocked: ${blockedAi.map((c) => c.crawler).join(", ")}`,
    ...(blockedAi.length === 0
      ? {}
      : { finding: crawler.findings.find((f) => f.category === "crawler_access" && /blocked/i.test(f.title)) }),
  });

  const sitemapReferenced = robots.sitemaps.length > 0;
  checks.push({
    id: "crawlers.sitemap",
    group: "crawler_access",
    label: "Sitemap referenced",
    status: sitemapReferenced ? "pass" : "warn",
    detail: sitemapReferenced ? robots.sitemaps[0] : "No `Sitemap:` line in robots.txt",
    ...(sitemapReferenced
      ? {}
      : { finding: crawler.findings.find((f) => f.title === "No sitemap referenced in robots.txt") }),
  });

  if (sitemapReferenced) {
    const sitemapEmptyFinding = guided(
      "seo",
      "sitemap",
      "medium",
      "Sitemap is referenced but returns no pages",
      "robots.txt points at a sitemap, but crawling it produced zero URLs. Check that the sitemap URL is live, valid XML, and lists your real pages: crawlers rely on it to find everything beyond the homepage.",
    );
    checks.push({
      id: "crawlers.sitemap_pages",
      group: "crawler_access",
      label: "Sitemap has pages",
      status: sitemapPageCount > 0 ? "pass" : "fail",
      detail: sitemapPageCount > 0 ? `${sitemapPageCount} pages discovered` : "0 pages discovered",
      ...(sitemapPageCount > 0 ? {} : { finding: sitemapEmptyFinding }),
    });
    if (sitemapPageCount === 0) newFindings.push(sitemapEmptyFinding);
  }

  const ssrStatus: HealthStatus =
    technical.ssr.severity === "LOW"
      ? "pass"
      : technical.ssr.severity === "MEDIUM"
        ? "warn"
        : "fail";
  checks.push({
    id: "crawlers.ssr",
    group: "crawler_access",
    label: "Content readable without JavaScript",
    status: ssrStatus,
    detail: `${technical.ssr.renderingType} · ${technical.ssr.framework}`,
    ...(ssrStatus === "pass"
      ? {}
      : { finding: technical.findings.find((f) => f.category === "ssr") }),
  });

  // ── Structured data ────────────────────────────────────────────────────────
  const detection = detectSchema(homepage);
  const validated = validateSchema(detection.blocks);
  const validCount = validated.filter((v) => v.valid).length;
  const schemaStatus: HealthStatus =
    validCount > 0 ? "pass" : detection.blocks.length > 0 ? "warn" : "fail";
  checks.push({
    id: "schema.present",
    group: "structured_data",
    label: "Structured data on homepage",
    status: schemaStatus,
    detail:
      detection.blocks.length === 0
        ? "None found"
        : `${detection.types.slice(0, 4).join(", ")}${validCount === 0 ? ": none validate" : ""}`,
    ...(schemaStatus === "pass"
      ? {}
      : {
          finding: guided(
            "aeo",
            "schema",
            "high",
            detection.blocks.length === 0
              ? "No structured data on your homepage"
              : "Structured data has validation errors",
            detection.blocks.length === 0
              ? "Add Organization and WebSite JSON-LD so Google and AI assistants can identify the site. Use the Schema Generator or ask your coding assistant to add it."
              : `The schema on your page fails validation (${validated.flatMap((v) => v.errors).slice(0, 3).join("; ")}). Search engines skip structured data that won't parse.`,
          ),
        }),
  });

  if (detection.blocks.length > 0) {
    checks.push({
      id: "schema.in_raw_html",
      group: "structured_data",
      label: "Schema visible to AI crawlers",
      status: detection.jsInjectionRisk ? "fail" : "pass",
      detail: detection.jsInjectionRisk
        ? "Injected by JavaScript: AI crawlers never see it"
        : "Present in the server HTML",
      ...(detection.jsInjectionRisk
        ? {
            finding: guided(
              "aeo",
              "schema",
              "high",
              "Structured data is injected by JavaScript",
              "Your schema only appears after JavaScript runs, but AI crawlers read the raw HTML. Move the JSON-LD into the server-rendered <head>.",
            ),
          }
        : {}),
    });
  }

  // ── AI readiness ───────────────────────────────────────────────────────────
  checks.push({
    id: "ai.llms_txt",
    group: "ai_readiness",
    label: "llms.txt",
    status: llmsValidation.exists ? (llmsValidation.format_valid ? "pass" : "warn") : "fail",
    detail: llmsValidation.exists
      ? llmsValidation.format_valid
        ? `Valid: ${llmsValidation.section_count} sections, ${llmsValidation.link_count} links`
        : `Found but has issues: ${llmsValidation.issues.slice(0, 2).join("; ")}`
      : "Missing",
    ...(llmsValidation.exists && llmsValidation.format_valid
      ? {}
      : {
          finding: guided(
            "geo",
            "llms_txt",
            "medium",
            llmsValidation.exists ? "llms.txt has formatting issues" : "Missing llms.txt",
            llmsValidation.exists
              ? `Fix the issues so AI assistants can parse it: ${llmsValidation.issues.join("; ")}.`
              : "llms.txt is a site map for AI assistants: a Markdown file at /llms.txt describing your site and key pages. The llms.txt Generator tool builds one from your sitemap.",
          ),
        }),
  });

  // ── Security ───────────────────────────────────────────────────────────────
  const https = homepage.url.startsWith("https:");
  checks.push({
    id: "security.https",
    group: "security",
    label: "HTTPS",
    status: https ? "pass" : "fail",
    detail: https ? "Served over HTTPS" : "Served over plain HTTP",
    ...(https
      ? {}
      : { finding: technical.findings.find((f) => f.category === "security" && f.severity === "critical") }),
  });

  const missingHeaders = Object.entries(homepage.security_headers)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  checks.push({
    id: "security.headers",
    group: "security",
    label: "Security headers",
    status: missingHeaders.length === 0 ? "pass" : "warn",
    detail:
      missingHeaders.length === 0
        ? "All recommended headers set"
        : `Missing: ${missingHeaders.slice(0, 3).join(", ")}${missingHeaders.length > 3 ? ` +${missingHeaders.length - 3}` : ""}`,
    ...(missingHeaders.length === 0
      ? {}
      : { finding: technical.findings.find((f) => f.category === "security" && f.severity === "low") }),
  });

  const summary = checks.reduce(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { pass: 0, warn: 0, fail: 0 },
  );

  return {
    snapshot: {
      version: 1,
      generatedAt: new Date().toISOString(),
      source,
      siteUrl: homepage.url,
      psiAvailable: psi != null,
      scores: psi?.scores ?? null,
      checks,
      summary,
    },
    findings: newFindings,
  };
}
