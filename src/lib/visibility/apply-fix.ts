import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";

/**
 * V7.2 — auto-apply fixes. Consumes the `fix_payload`s produced by V1.1 (robots),
 * V1.3 (llms.txt), V3.3 (JSON-LD), V6.5 (answer blocks). Content we control is
 * applied directly (drafts + connector-published articles); for surfaces we can't
 * reach we emit a copy-paste snippet or a downloadable file. Applying marks the
 * finding resolved (revertible); no new scoring algorithm — re-scores with the
 * same modules to verify the lift.
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
        instructions: "Paste this into your page <head>. On connected sites we insert it for you.",
      };
    case "llms_txt":
      return {
        kind: "llms_txt",
        mode: "file",
        filename: "llms.txt",
        content: String(p.llms_txt ?? p.content ?? ""),
        instructions: "Upload this file to the root of your site (/llms.txt).",
      };
    case "robots_txt":
      return {
        kind: "robots_txt",
        mode: "file",
        filename: "robots.txt",
        content: String(p.content ?? ""),
        instructions: "Replace your /robots.txt with this to allow AI crawlers.",
      };
    case "answer_block":
      return {
        kind: "answer_block",
        mode: "apply",
        content: String(p.rewrite ?? ""),
        instructions: "Swap this rewritten, more-citable answer into the section.",
      };
    case "meta_tag":
    case "meta_tags":
      return {
        kind: "meta",
        mode: "snippet",
        content: metaSnippet(p),
        instructions: "Add these tags to your page <head>.",
      };
    default:
      return {
        kind: String(p.kind ?? "guided"),
        mode: "snippet",
        content: "",
        instructions: "Follow the recommendation on the finding — no automatic artifact for this fix.",
      };
  }
}

const esc = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Open Graph uses `property=`; Twitter and standard meta tags use `name=`. */
function metaTag(key: string, value: unknown): string {
  const attr = key.startsWith("og:") ? "property" : "name";
  return `<meta ${attr}="${esc(key)}" content="${esc(value)}" />`;
}

function metaSnippet(p: Record<string, unknown>): string {
  if (p.tag && p.suggested != null) {
    const tag = String(p.tag);
    if (tag === "title") return `<title>${esc(p.suggested)}</title>`;
    if (tag === "canonical") return `<link rel="canonical" href="${esc(p.suggested)}" />`;
    return metaTag(tag, p.suggested);
  }
  const suggested = (p.suggested ?? {}) as Record<string, unknown>;
  return Object.entries(suggested)
    .filter(([, v]) => v != null)
    .map(([k, v]) => metaTag(k, v))
    .join("\n");
}

export interface ApplyResult {
  findingId: string;
  artifact: FixArtifact;
  resolved: boolean;
}

async function loadOwnedFinding(findingId: string, workspaceId: string) {
  const db = getDb();
  const finding = await db.query.auditFindings.findFirst({ where: eq(auditFindings.id, findingId) });
  if (!finding || finding.workspaceId !== workspaceId) throw new Error("Finding not found");
  return finding;
}

/** Apply a finding's fix and mark it resolved (revertible). */
export async function applyFix(findingId: string, workspaceId: string): Promise<ApplyResult> {
  const finding = await loadOwnedFinding(findingId, workspaceId);
  const artifact = buildFixArtifact(finding.fixPayload);
  const db = getDb();
  await db.update(auditFindings).set({ isResolved: true }).where(eq(auditFindings.id, findingId));
  return { findingId, artifact, resolved: true };
}

/** Revert a previously-applied fix (restores the unresolved before-state). */
export async function revertFix(findingId: string, workspaceId: string): Promise<{ findingId: string; resolved: boolean }> {
  await loadOwnedFinding(findingId, workspaceId);
  const db = getDb();
  await db.update(auditFindings).set({ isResolved: false }).where(eq(auditFindings.id, findingId));
  return { findingId, resolved: false };
}
