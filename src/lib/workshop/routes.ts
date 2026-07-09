/**
 * Agent OS Workshop — power-user routes buried under Brand → Workshop.
 * Primary nav never lists these; owners live on Claudia / Inbox / Reports / Brand.
 */

export type WorkshopIconId =
  | "topics"
  | "pen"
  | "gauge"
  | "workshop"
  | "chart"
  | "activity";

export type WorkshopLink = {
  href: string;
  title: string;
  description: string;
  group: "content" | "visibility" | "ops";
  icon: WorkshopIconId;
};

export const WORKSHOP_LINKS: WorkshopLink[] = [
  {
    href: "/topics",
    title: "Topic queue",
    description: "What she's planning to write next, with traffic theses.",
    group: "content",
    icon: "topics",
  },
  {
    href: "/articles",
    title: "Articles",
    description: "Every draft and published piece she's written.",
    group: "content",
    icon: "pen",
  },
  {
    href: "/visibility",
    title: "Visibility scorecard",
    description: "Sub-scores, trends, and re-audit controls.",
    group: "visibility",
    icon: "gauge",
  },
  {
    href: "/visibility/fixes",
    title: "Fix queue",
    description: "Every finding ranked by severity with actions.",
    group: "visibility",
    icon: "workshop",
  },
  {
    href: "/visibility/health",
    title: "Site health",
    description: "Technical checklist groups under the score.",
    group: "visibility",
    icon: "gauge",
  },
  {
    href: "/visibility/answers",
    title: "AI answers",
    description: "Where ChatGPT, Perplexity, and Gemini mention you.",
    group: "visibility",
    icon: "chart",
  },
  {
    href: "/tools",
    title: "Extra tools",
    description: "Standalone analyzers for one-off runs (credits).",
    group: "visibility",
    icon: "workshop",
  },
  {
    href: "/activity",
    title: "Full work log",
    description: "Job-level history with retries and credit spend.",
    group: "ops",
    icon: "activity",
  },
];

const WORKSHOP_PREFIXES = [
  "/topics",
  "/articles",
  "/visibility",
  "/tools",
  "/activity",
] as const;

/** True when the path is a Workshop (advanced) surface, not Agent OS primary. */
export function isWorkshopPath(pathname: string): boolean {
  return WORKSHOP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function workshopLinkForPath(pathname: string): WorkshopLink | null {
  let best: WorkshopLink | null = null;
  for (const link of WORKSHOP_LINKS) {
    if (
      (pathname === link.href || pathname.startsWith(`${link.href}/`)) &&
      (!best || link.href.length > best.href.length)
    ) {
      best = link;
    }
  }
  return best;
}
