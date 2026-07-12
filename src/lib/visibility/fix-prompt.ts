import { PILLAR_LABELS } from "./display";
import { buildFixArtifact } from "./fix-artifact";
import type { Pillar } from "./types";

/**
 * Fix-queue → AI-coding-assistant handoff. Builds one paste-ready prompt per
 * finding so the owner can drop it into Cursor / Claude Code / Copilot and have
 * the fix implemented in their own codebase. Client-safe and pure: the prompt
 * is assembled from the finding the queue already has, no extra requests.
 */

export type PromptableFinding = {
  pillar: Pillar;
  category: string;
  severity: string;
  title: string;
  recommendation: string;
  fixPayload?: unknown;
};

/** Per-artifact-kind hint telling the assistant where the fix usually lives. */
const PLACEMENT_HINTS: Record<string, string> = {
  schema:
    "This JSON-LD belongs in the <head> of the relevant page: in a Next.js/React app that's the layout or page component; on WordPress a header template or SEO plugin.",
  llms_txt:
    "Serve this file at /llms.txt from the site root: usually the public/ or static/ folder, or a small route that returns it as text/plain.",
  robots_txt:
    "This replaces the site's robots.txt at the root: usually public/robots.txt, a robots route, or the hosting platform's robots setting.",
  meta:
    "These tags belong in the <head> of the page: in a Next.js app via the metadata export or the layout; elsewhere in the header template.",
  answer_block:
    "Replace the existing section's copy with this rewritten version in the page's content source (CMS entry, markdown file, or component).",
  psi_perf:
    "These are page-level performance fixes: they usually live in the app's layout/head (scripts, fonts, CSS), image components (dimensions, lazy-loading, modern formats), and build config (bundling, compression).",
};

/**
 * One paste-ready prompt for an AI coding assistant. Includes what's wrong, why
 * it matters, the generated artifact when one exists, and a concrete task list
 * ending in a verification step.
 */
export function buildFixPrompt(finding: PromptableFinding, website?: string | null): string {
  const artifact = buildFixArtifact(finding.fixPayload);
  const lines: string[] = [
    "I'm improving my website's visibility in Google and in AI assistants (ChatGPT, Perplexity, Gemini). A visibility audit found the issue below: please fix it in this project.",
    "",
  ];
  if (website) lines.push(`Website: ${website}`);
  lines.push(
    `Issue: ${finding.title}`,
    `Severity: ${finding.severity} · Area: ${PILLAR_LABELS[finding.pillar]}`,
    `Why it matters: ${finding.recommendation}`,
  );

  if (artifact.content.trim()) {
    lines.push(
      "",
      "The audit already generated the fix: apply this (adapt placeholder values to the real site):",
      "",
      "```",
      artifact.content.trim(),
      "```",
      "",
      `How to apply: ${artifact.instructions}`,
    );
    const hint = PLACEMENT_HINTS[artifact.kind];
    if (hint) lines.push(`Where it goes: ${hint}`);
  }

  lines.push(
    "",
    "Please:",
    "1. Find the right place for this fix in the project and apply it.",
    artifact.content.trim()
      ? "2. Keep the generated content but replace any placeholder or wrong values with the site's real details."
      : "2. Implement the recommendation above in the way that fits this codebase.",
    "3. Tell me exactly which files you changed and how I can verify the fix once deployed (a URL to open or a command to run).",
  );

  return lines.join("\n");
}
