import type { Finding, PageSnapshot, Severity } from "./types";

/**
 * V1.4 — meta tags & Open Graph auditor. Rule table from
 * `inspiration-code/agents/geo-technical.md` → Step 3, including the
 * presence-vs-quality note: a title of "Home"/"Untitled" is effectively
 * missing. Reads the V0.1 `PageSnapshot` — never fetches.
 */

export type MetaTagStatus = "present" | "missing" | "issue";

export interface MetaTagCheck {
  tag: string;
  status: MetaTagStatus;
  value: string | null;
  note?: string;
}

export interface MetaAuditResult {
  checks: MetaTagCheck[];
  /** Convenience score for the quick snapshot (V2.2 defines the real sub-score). */
  score: number;
  findings: Finding[];
}

const PLACEHOLDER_TITLE = /^(home|homepage|untitled|index|welcome|new page|document|title)$/i;

const OG_TAGS = ["og:title", "og:description", "og:image", "og:url", "og:type"];
const TWITTER_TAGS = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"];

const DEDUCTION: Record<Severity, number> = { critical: 20, high: 15, medium: 10, low: 5 };

/** Derive a description suggestion from page text, cut at a word boundary. */
function suggestDescription(text: string): string | null {
  if (!text) return null;
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

export function auditMeta(snapshot: PageSnapshot): MetaAuditResult {
  const checks: MetaTagCheck[] = [];
  const findings: Finding[] = [];

  const finding = (
    severity: Severity,
    title: string,
    recommendation: string,
    suggested?: unknown,
  ) => {
    findings.push({
      pillar: "seo",
      category: "meta_tags",
      severity,
      title,
      recommendation,
      ...(suggested != null
        ? { fix_capability: "artifact" as const, fix_payload: suggested }
        : { fix_capability: "guided" as const }),
    });
  };

  // Title — presence AND quality
  const title = snapshot.title?.trim() ?? "";
  if (!title || PLACEHOLDER_TITLE.test(title)) {
    checks.push({
      tag: "title",
      status: "missing",
      value: snapshot.title,
      note: title ? "Placeholder title — effectively missing" : undefined,
    });
    const suggested = snapshot.h1_tags.find((h) => h && !PLACEHOLDER_TITLE.test(h)) ?? null;
    finding(
      "high",
      title ? `Title is a placeholder ("${title}")` : "Missing <title> tag",
      "Write a descriptive 50–60 character title including your primary keyword.",
      suggested ? { kind: "meta_tag", tag: "title", suggested } : undefined,
    );
  } else if (title.length < 50 || title.length > 60) {
    checks.push({
      tag: "title",
      status: "issue",
      value: title,
      note: `${title.length} chars (target 50–60)`,
    });
    finding(
      "low",
      title.length > 60 ? "Title exceeds 60 characters" : "Title shorter than 50 characters",
      "Aim for 50–60 characters so search results show the full title.",
    );
  } else {
    checks.push({ tag: "title", status: "present", value: title });
  }

  // Description
  const description = snapshot.description?.trim() ?? "";
  if (!description) {
    checks.push({ tag: "description", status: "missing", value: null });
    const suggested = suggestDescription(snapshot.text_content);
    finding(
      "medium",
      "Missing meta description",
      "Add a compelling 150–160 character description — otherwise Google generates its own.",
      suggested ? { kind: "meta_tag", tag: "description", suggested } : undefined,
    );
  } else if (description.length < 150 || description.length > 160) {
    checks.push({
      tag: "description",
      status: "issue",
      value: description,
      note: `${description.length} chars (target 150–160)`,
    });
    if (description.length > 160) {
      finding(
        "low",
        "Meta description exceeds 160 characters",
        "Trim to 150–160 characters so it isn't truncated in results.",
        { kind: "meta_tag", tag: "description", suggested: suggestDescription(description) },
      );
    }
  } else {
    checks.push({ tag: "description", status: "present", value: description });
  }

  // Canonical
  const canonical = snapshot.canonical?.trim() ?? "";
  if (!canonical) {
    checks.push({ tag: "canonical", status: "missing", value: null });
    finding(
      "medium",
      "Missing canonical link",
      "Add a self-referencing canonical to avoid duplicate-content issues.",
      { kind: "meta_tag", tag: "canonical", suggested: snapshot.url },
    );
  } else {
    const self =
      canonical.replace(/\/$/, "") === snapshot.url.replace(/\/$/, "");
    checks.push({
      tag: "canonical",
      status: "present",
      value: canonical,
      note: self ? undefined : "Points to a different URL — verify it's the preferred version",
    });
  }

  // Robots directives (meta + X-Robots-Tag header)
  const robotsDirectives = [
    snapshot.meta_tags["robots"],
    snapshot.headers["x-robots-tag"],
  ]
    .filter(Boolean)
    .join(", ");
  if (/noindex/i.test(robotsDirectives)) {
    checks.push({ tag: "robots", status: "issue", value: robotsDirectives, note: "noindex" });
    finding(
      "high",
      "Page is set to noindex",
      "Remove the noindex directive — this page is excluded from search and AI answers.",
    );
  } else {
    checks.push({
      tag: "robots",
      status: "present",
      value: robotsDirectives || null,
      note: robotsDirectives ? undefined : "Not set — indexable by default",
    });
  }

  // Viewport
  const viewport = snapshot.meta_tags["viewport"] ?? "";
  if (!viewport.includes("width=device-width")) {
    checks.push({
      tag: "viewport",
      status: viewport ? "issue" : "missing",
      value: viewport || null,
    });
    finding(
      "medium",
      viewport ? "Viewport tag is misconfigured" : "Missing viewport tag",
      "Mobile usability failure without it — search engines penalize non-mobile pages.",
      { kind: "meta_tag", tag: "viewport", suggested: "width=device-width, initial-scale=1" },
    );
  } else {
    checks.push({ tag: "viewport", status: "present", value: viewport });
  }

  // <html lang> — read from the raw HTML (not captured as a meta tag)
  const lang = snapshot.html.match(/<html[^>]*\blang\s*=\s*["']?([a-zA-Z0-9-]+)/i)?.[1] ?? null;
  if (lang) {
    checks.push({ tag: "lang", status: "present", value: lang });
  } else {
    checks.push({ tag: "lang", status: "missing", value: null });
    finding(
      "low",
      "Missing lang attribute on <html>",
      "Declare the page language so crawlers and screen readers detect it correctly.",
      { kind: "html_attribute", tag: "html", attribute: "lang", suggested: "en" },
    );
  }

  // Open Graph
  const ogPresent = OG_TAGS.filter((t) => snapshot.meta_tags[t]);
  if (ogPresent.length < OG_TAGS.length) {
    checks.push({
      tag: "open_graph",
      status: ogPresent.length > 0 ? "issue" : "missing",
      value: null,
      note: `${ogPresent.length}/${OG_TAGS.length} tags (missing: ${OG_TAGS.filter((t) => !snapshot.meta_tags[t]).join(", ")})`,
    });
    finding(
      "low",
      ogPresent.length > 0 ? "Incomplete Open Graph tags" : "Missing Open Graph tags",
      "Without them, links shared to social platforms and AI previews render poorly.",
      {
        kind: "meta_tags",
        suggested: {
          "og:title": snapshot.meta_tags["og:title"] ?? (title || null),
          "og:description": snapshot.meta_tags["og:description"] ?? (description || null),
          "og:url": snapshot.meta_tags["og:url"] ?? (canonical || snapshot.url),
          "og:type": snapshot.meta_tags["og:type"] ?? "website",
          "og:image": snapshot.meta_tags["og:image"] ?? null,
        },
      },
    );
  } else {
    checks.push({ tag: "open_graph", status: "present", value: null, note: "All 5 tags set" });
  }

  // Twitter Card
  const twitterPresent = TWITTER_TAGS.filter((t) => snapshot.meta_tags[t]);
  if (twitterPresent.length < TWITTER_TAGS.length) {
    checks.push({
      tag: "twitter_card",
      status: twitterPresent.length > 0 ? "issue" : "missing",
      value: null,
      note: `${twitterPresent.length}/${TWITTER_TAGS.length} tags`,
    });
    finding(
      "low",
      twitterPresent.length > 0 ? "Incomplete Twitter Card tags" : "Missing Twitter Card tags",
      "Add twitter:card, twitter:title, twitter:description and twitter:image for rich X previews.",
      {
        kind: "meta_tags",
        suggested: {
          "twitter:card": snapshot.meta_tags["twitter:card"] ?? "summary_large_image",
          "twitter:title": snapshot.meta_tags["twitter:title"] ?? (title || null),
          "twitter:description":
            snapshot.meta_tags["twitter:description"] ?? (description || null),
          "twitter:image": snapshot.meta_tags["twitter:image"] ?? null,
        },
      },
    );
  } else {
    checks.push({ tag: "twitter_card", status: "present", value: null, note: "All 4 tags set" });
  }

  // hreflang — informational only (can't detect multilingual from one page)
  const hreflangCount = (snapshot.html.match(/\bhreflang\s*=/gi) ?? []).length;
  checks.push({
    tag: "hreflang",
    status: hreflangCount > 0 ? "present" : "missing",
    value: hreflangCount > 0 ? `${hreflangCount} alternates` : null,
    note: hreflangCount > 0 ? undefined : "Only needed for multilingual sites",
  });

  const score = Math.max(
    0,
    findings.reduce((s, f) => s - DEDUCTION[f.severity], 100),
  );

  return { checks, score, findings };
}
