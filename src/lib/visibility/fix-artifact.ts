import { escapeHtml as esc } from "@/lib/html";

/**
 * Pure fix-artifact builder: turns a finding's stored `fix_payload` into the
 * thing the owner actually uses: a paste-ready snippet, a downloadable file, or
 * an applicable rewrite. Client-safe (no db imports) so the fix queue can render
 * artifacts inline; the server's `apply-fix.ts` consumes the same builder.
 */

export type FixMode = "snippet" | "file" | "apply";

export interface FixArtifact {
  kind: string;
  mode: FixMode;
  /** The content to paste, download, or apply. */
  content: string;
  filename?: string;
  instructions: string;
}

/** Pure: turn a stored `fix_payload` into an applicable/copyable artifact. */
export function buildFixArtifact(payload: unknown): FixArtifact {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (p.kind) {
    case "schema":
    case "jsonld":
      return {
        kind: "schema",
        mode: "snippet",
        content: `<script type="application/ld+json">\n${JSON.stringify(p.jsonLd ?? p, null, 2).replace(/</g, "\\u003c")}\n</script>`,
        instructions:
          "Copy and paste this into your page <head> (or CMS custom-code field). When it's live, mark the finding done: Claudia re-checks on the next audit.",
      };
    case "llms_txt":
      return {
        kind: "llms_txt",
        mode: "file",
        filename: "llms.txt",
        content: String(p.llms_txt ?? p.content ?? ""),
        instructions:
          "Download and upload this file to your site root as /llms.txt. Mark the finding done once it's reachable.",
      };
    case "robots_txt":
      return {
        kind: "robots_txt",
        mode: "file",
        filename: "robots.txt",
        content: String(p.content ?? ""),
        instructions:
          "Replace your live /robots.txt with this file (hosting panel, repo, or CMS). Mark done when it's deployed.",
      };
    case "answer_block":
      return {
        kind: "answer_block",
        mode: "apply",
        content: String(p.rewrite ?? ""),
        instructions:
          "Replace the page section with this rewritten, more-citable answer in your CMS or codebase. Mark done when published.",
      };
    case "meta_tag":
    case "meta_tags":
      return {
        kind: "meta",
        mode: "snippet",
        content: metaSnippet(p),
        instructions:
          "Add these tags to your page <head> (or SEO plugin fields). Mark the finding done when live.",
      };
    case "psi_perf":
      return {
        kind: "psi_perf",
        mode: "snippet",
        content: psiOpportunityList(p),
        instructions:
          "Lighthouse opportunities on this page, biggest savings first: implement in your codebase in order, then mark done.",
      };
    default:
      return {
        kind: String(p.kind ?? "guided"),
        mode: "snippet",
        content: "",
        instructions:
          "Follow the recommendation on the finding: no ready-made snippet for this one. Mark done after you've fixed it on the site.",
      };
  }
}

/** Open Graph uses `property=`; Twitter and standard meta tags use `name=`. */
function metaTag(key: string, value: unknown): string {
  const attr = key.startsWith("og:") ? "property" : "name";
  return `<meta ${attr}="${esc(key)}" content="${esc(String(value))}" />`;
}

function metaSnippet(p: Record<string, unknown>): string {
  if (p.tag && p.suggested != null) {
    const tag = String(p.tag);
    if (tag === "title") return `<title>${esc(p.suggested)}</title>`;
    if (tag === "canonical") return `<link rel="canonical" href="${esc(p.suggested)}" />`;
    if (tag === "icon") return `<link rel="icon" href="${esc(p.suggested)}" sizes="any" />`;
    return metaTag(tag, p.suggested);
  }
  const suggested = (p.suggested ?? {}) as Record<string, unknown>;
  return Object.entries(suggested)
    .filter(([, v]) => v != null)
    .map(([k, v]) => metaTag(k, v))
    .join("\n");
}

/** Plain-text list of PageSpeed opportunities for the `psi_perf` payload. */
function psiOpportunityList(p: Record<string, unknown>): string {
  const opportunities = Array.isArray(p.opportunities) ? p.opportunities : [];
  return opportunities
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const detail =
        typeof o.displayValue === "string" && o.displayValue
          ? o.displayValue
          : typeof o.savingsMs === "number"
            ? `~${Math.round(o.savingsMs)}ms savings`
            : null;
      return `- ${String(o.title ?? o.id ?? "Unknown issue")}${detail ? ` (${detail})` : ""}`;
    })
    .join("\n");
}
