import { PILLAR_LABELS } from "./display";
import { buildFixArtifact } from "./fix-artifact";
import type { Pillar } from "./types";

/**
 * Fix-queue to implementation handoff. Each finding can become either a
 * paste-ready prompt for Claude Code, Codex, or Cursor, or a manual checklist.
 */

export type PromptableFinding = {
  pillar: Pillar;
  category: string;
  severity: string;
  title: string;
  recommendation: string;
  fixPayload?: unknown;
};

const PLACEMENT_HINTS: Record<string, string> = {
  schema:
    "This JSON-LD belongs in the <head> of the relevant page: in a Next.js/React app that is the layout or page component; on WordPress, use a header template or SEO plugin.",
  llms_txt:
    "Serve this file at /llms.txt from the site root: usually the public/ or static/ folder, or a small route that returns text/plain.",
  robots_txt:
    "This replaces the site's robots.txt at the root: usually public/robots.txt, a robots route, or the hosting platform's robots setting.",
  meta:
    "These tags belong in the page <head>: in a Next.js app use the metadata export or layout; elsewhere use the header template or SEO fields.",
  answer_block:
    "Replace the matching section in the page's content source, such as a CMS entry, Markdown file, or component.",
  psi_perf:
    "These page-level performance fixes usually live in the layout/head, image components, styles, scripts, fonts, or build configuration.",
};

/** Build a safe, repo-aware implementation prompt for an AI coding agent. */
export function buildFixPrompt(
  finding: PromptableFinding,
  website?: string | null,
): string {
  const artifact = buildFixArtifact(finding.fixPayload);
  const lines: string[] = [
    "Act as the implementation engineer for this website. A Claudia organic-growth audit found the issue below. Inspect the existing project first, then implement the smallest safe fix that follows its current framework, conventions, and deployment model.",
    "",
  ];
  if (website) lines.push(`Website: ${website}`);
  lines.push(
    `Issue: ${finding.title}`,
    `Severity: ${finding.severity} | Area: ${PILLAR_LABELS[finding.pillar]}`,
    `Why it matters: ${finding.recommendation}`,
  );

  if (artifact.content.trim()) {
    lines.push(
      "",
      "The audit generated this starting artifact. Apply it after checking every value against the project:",
      "",
      "```",
      artifact.content.trim(),
      "```",
      "",
      `How to apply: ${artifact.instructions}`,
    );
    const hint = PLACEMENT_HINTS[artifact.kind];
    if (hint) lines.push(`Likely placement: ${hint}`);
  }

  lines.push(
    "",
    "Implementation requirements:",
    "1. Inspect the repository and identify the correct file, route, template, CMS adapter, or configuration before editing.",
    artifact.content.trim()
      ? "2. Preserve the artifact's intent, but replace placeholders or incorrect values with verified project details."
      : "2. Implement the recommendation in the way that best fits this codebase.",
    "3. Avoid unrelated refactors, new dependencies, or visual changes unless the fix requires them.",
    "4. Run the narrowest relevant lint, typecheck, test, or build command available in the repository.",
    "5. Report the files changed, reasoning, validation performed, and the exact URL or command I should use after deployment to verify the result.",
  );

  return lines.join("\n");
}

const MANUAL_STEPS: Record<string, string[]> = {
  schema: [
    "Open the affected page in your CMS or site builder and find its custom code, header, or SEO settings.",
    "Add the supplied JSON-LD script to the page head. Do not paste it into visible page copy.",
    "Publish the page, then open its live source and confirm the script appears once with the correct brand details.",
  ],
  llms_txt: [
    "Open your hosting file manager, static-file area, or site builder's root-file settings.",
    "Create a plain-text file named llms.txt using the supplied content and publish it at the site root.",
    "Open /llms.txt on the live domain and confirm it loads as plain text without a redirect or error.",
  ],
  robots_txt: [
    "Open the robots.txt editor in your CMS, hosting panel, or SEO plugin.",
    "Back up the existing rules, then replace them with the supplied version after checking that important pages remain allowed.",
    "Publish and open /robots.txt on the live domain to confirm the new rules are visible.",
  ],
  meta: [
    "Open the affected page's SEO settings or head-code settings.",
    "Copy the supplied title, canonical, or meta values into the matching fields without creating duplicates.",
    "Publish the page, view its live source, and confirm each tag appears once with the expected value.",
  ],
  answer_block: [
    "Open the affected page in the CMS or content editor and locate the matching answer section.",
    "Replace only that section with the supplied copy, keeping verified facts, links, and brand terminology accurate.",
    "Publish the page and read the live section on desktop and mobile to confirm it is clear and complete.",
  ],
  psi_perf: [
    "Send the coding-agent prompt to Claude Code, Codex, Cursor, or your developer because this fix requires repository changes.",
    "Review the proposed files and validation before approving the change.",
    "Deploy the change, rerun the same performance test, and compare the result with the audit baseline.",
  ],
};

/** Build a non-technical checklist for CMS, hosting, or other manual changes. */
export function buildManualFixGuide(
  finding: PromptableFinding,
  website?: string | null,
): string {
  const artifact = buildFixArtifact(finding.fixPayload);
  const steps = MANUAL_STEPS[artifact.kind] ?? [
    "Open the affected page or setting in your CMS, hosting panel, or site builder.",
    "Follow the recommendation below and save or publish the change.",
    "Open the live page and confirm the issue is resolved before marking the work complete.",
  ];
  const lines = [
    `Manual implementation guide: ${finding.title}`,
    website ? `Website: ${website}` : "Website: your live site",
    `Why this matters: ${finding.recommendation}`,
    "",
    "Before you start: save the current value or take a screenshot so you can restore it if needed.",
    "",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ];

  if (artifact.content.trim()) {
    lines.push("", "Content to use:", "", artifact.content.trim());
  }

  lines.push(
    "",
    `${steps.length + 1}. Return to Claudia and mark the fix installed. She will recheck it during the next audit.`,
  );
  return lines.join("\n");
}
