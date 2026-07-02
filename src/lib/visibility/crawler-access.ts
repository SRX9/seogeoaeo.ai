import type { AiCrawlerStatus, Finding, RobotsResult, RobotsRule } from "./types";

/**
 * V1.1 — AI crawler access analyzer + V1.2 — Content Signals checker.
 * Consumes the V0.2 `RobotsResult` (never re-fetches). Score algorithm ported
 * exactly from `inspiration-code/agents/geo-ai-visibility.md` → Step 3.
 */

export const CRAWLER_TIERS: Record<1 | 2 | 3, readonly string[]> = {
  1: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot"],
  2: ["Google-Extended", "GoogleOther", "Applebot-Extended", "Amazonbot", "FacebookBot"],
  3: ["CCBot", "anthropic-ai", "Bytespider", "cohere-ai"],
};

/** −15 each when blocked (per the Step 3 algorithm). Googlebot included. */
const CRITICAL_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "Googlebot"];

const TIER_SEVERITY: Record<1 | 2 | 3, Finding["severity"]> = {
  1: "high",
  2: "medium",
  3: "low",
};

export interface CrawlerTierEntry {
  crawler: string;
  tier: 1 | 2 | 3;
  status: AiCrawlerStatus;
  blocked: boolean;
}

export type ContentSignalsStatus = "pass" | "warning" | "recommendation";

export interface ContentSignalsResult {
  status: ContentSignalsStatus;
  /** Raw `Content-Signal:` line(s), null when absent. */
  raw: string | null;
  /** Parsed key=value pairs (lowercased). */
  signals: Record<string, string>;
  issues: string[];
  /** Plain-English meaning / recommendation. */
  explanation: string;
}

export interface CrawlerAccessResult {
  score: number;
  crawlers: CrawlerTierEntry[];
  googlebotBlocked: boolean;
  sitemapReferenced: boolean;
  contentSignals: ContentSignalsResult;
  /** Ready-to-paste robots.txt configured for maximum AI visibility. */
  recommendedRobotsTxt: string;
  findings: Finding[];
}

const isBlocked = (status: AiCrawlerStatus) =>
  status === "BLOCKED" || status === "BLOCKED_BY_WILDCARD";

/** Same state machine as V0.2 `classifyCrawlers`, for a single agent. */
function classifyAgent(
  agentRules: Record<string, RobotsRule[]>,
  agent: string,
): AiCrawlerStatus {
  const key = Object.keys(agentRules).find(
    (k) => k.toLowerCase() === agent.toLowerCase(),
  );
  const rules = key ? agentRules[key] : undefined;
  if (rules) {
    if (rules.some((r) => r.directive === "Disallow" && r.path === "/")) return "BLOCKED";
    if (rules.some((r) => r.directive === "Disallow" && r.path)) return "PARTIALLY_BLOCKED";
    return "ALLOWED";
  }
  const wildcard = agentRules["*"];
  if (wildcard) {
    return wildcard.some((r) => r.directive === "Disallow" && r.path === "/")
      ? "BLOCKED_BY_WILDCARD"
      : "ALLOWED_BY_DEFAULT";
  }
  return "NOT_MENTIONED";
}

/** Recommended robots.txt: allow all Tier 1/2 crawlers, keep sitemap lines. */
function buildRecommendedRobotsTxt(robots: RobotsResult): string {
  const lines: string[] = ["# AI crawlers — allow for maximum AI visibility"];
  for (const crawler of [...CRAWLER_TIERS[1], ...CRAWLER_TIERS[2]]) {
    lines.push(`User-agent: ${crawler}`, "Allow: /", "");
  }
  lines.push("User-agent: *", "Allow: /", "");
  for (const sitemap of robots.sitemaps) {
    lines.push(`Sitemap: ${sitemap}`);
  }
  return lines.join("\n").trimEnd() + "\n";
}

const VALID_SIGNAL_KEYS = ["ai-train", "search", "ai-personalization", "ai-retrieval"];
const VALID_SIGNAL_VALUES = ["yes", "no"];

const SIGNAL_MEANINGS: Record<string, { yes: string; no: string }> = {
  "ai-train": {
    yes: "content may be used to train AI models",
    no: "content must not be used to train AI models",
  },
  search: {
    yes: "content may be indexed and shown in search results",
    no: "content must not be shown in search results",
  },
  "ai-personalization": {
    yes: "content may be used to personalize AI experiences",
    no: "content must not be used to personalize AI experiences",
  },
  "ai-retrieval": {
    yes: "AI assistants may retrieve this content to answer questions",
    no: "AI assistants must not retrieve this content to answer questions",
  },
};

/**
 * V1.2 — parse the IETF-draft `Content-Signal:` directive from robots.txt.
 * Non-scoring: unknown keys are warnings, never failures (the draft is still
 * evolving — see `inspiration-code/pr-draft-content-signals.md`).
 */
export function parseContentSignals(robotsText: string): ContentSignalsResult {
  const rawLines = robotsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^content-signal:/i.test(l));

  if (rawLines.length === 0) {
    return {
      status: "recommendation",
      raw: null,
      signals: {},
      issues: [],
      explanation:
        "No Content-Signal directive found. Add one to robots.txt to declare how AI " +
        "systems may use your content, e.g. `Content-Signal: ai-train=no, search=yes, " +
        "ai-retrieval=yes`. See https://contentsignals.org/",
    };
  }

  const signals: Record<string, string> = {};
  const issues: string[] = [];
  const meanings: string[] = [];

  for (const line of rawLines) {
    const body = line.slice(line.indexOf(":") + 1);
    for (const pair of body.split(",")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        issues.push(`Malformed pair "${trimmed}" (expected key=value)`);
        continue;
      }
      const key = trimmed.slice(0, eq).trim().toLowerCase();
      const value = trimmed.slice(eq + 1).trim().toLowerCase();
      signals[key] = value;
      if (!VALID_SIGNAL_KEYS.includes(key)) {
        issues.push(`Unknown key "${key}" (valid: ${VALID_SIGNAL_KEYS.join(", ")})`);
      } else if (!VALID_SIGNAL_VALUES.includes(value)) {
        issues.push(`Invalid value "${value}" for "${key}" (use yes or no)`);
      } else {
        meanings.push(SIGNAL_MEANINGS[key][value as "yes" | "no"]);
      }
    }
  }

  return {
    status: issues.length > 0 ? "warning" : "pass",
    raw: rawLines.join("\n"),
    signals,
    issues,
    explanation:
      meanings.length > 0
        ? meanings.join("; ") + "."
        : "Content-Signal directive present but no valid pairs parsed.",
  };
}

/**
 * V1.1 — map robots.txt against the AI crawlers in 3 tiers and compute the
 * Crawler Access Score: start 100, −15 per critical crawler blocked, −5 per
 * secondary crawler blocked, −10 if no sitemap referenced, floor 0.
 * Content Signals (V1.2) are attached but never affect the score.
 */
export function analyzeCrawlerAccess(robots: RobotsResult): CrawlerAccessResult {
  const crawlers: CrawlerTierEntry[] = [];
  for (const tier of [1, 2, 3] as const) {
    for (const crawler of CRAWLER_TIERS[tier]) {
      const status =
        robots.ai_crawler_status[crawler] ??
        classifyAgent(robots.agent_rules, crawler);
      crawlers.push({ crawler, tier, status, blocked: isBlocked(status) });
    }
  }

  const googlebotBlocked = isBlocked(classifyAgent(robots.agent_rules, "Googlebot"));
  const sitemapReferenced = robots.sitemaps.length > 0;

  let score = 100;
  if (googlebotBlocked) score -= 15;
  for (const entry of crawlers) {
    if (!entry.blocked) continue;
    score -= CRITICAL_CRAWLERS.includes(entry.crawler) ? 15 : 5;
  }
  if (!sitemapReferenced) score -= 10;
  score = Math.max(0, score);

  const recommendedRobotsTxt = buildRecommendedRobotsTxt(robots);
  const robotsFix = {
    fix_capability: "auto" as const,
    fix_payload: { kind: "robots_txt", content: recommendedRobotsTxt },
  };

  const findings: Finding[] = [];
  for (const entry of crawlers) {
    if (!entry.blocked) continue;
    findings.push({
      pillar: "geo",
      category: "crawler_access",
      severity: TIER_SEVERITY[entry.tier],
      title: `${entry.crawler} is blocked in robots.txt`,
      recommendation: `Allow ${entry.crawler} so its AI service can read and cite your content.`,
      ...robotsFix,
    });
  }
  if (googlebotBlocked) {
    findings.push({
      pillar: "seo",
      category: "crawler_access",
      severity: "critical",
      title: "Googlebot is blocked in robots.txt",
      recommendation: "Unblock Googlebot — the site is invisible to Google Search.",
      ...robotsFix,
    });
  }
  if (!sitemapReferenced) {
    findings.push({
      pillar: "seo",
      category: "crawler_access",
      severity: "medium",
      title: "No sitemap referenced in robots.txt",
      recommendation:
        "Add a `Sitemap:` line to robots.txt so crawlers can discover all your pages.",
      fix_capability: "guided",
    });
  }
  if (!robots.exists) {
    findings.push({
      pillar: "geo",
      category: "crawler_access",
      severity: "medium",
      title: "No robots.txt found",
      recommendation:
        "Add a robots.txt that explicitly allows AI crawlers and references your sitemap.",
      ...robotsFix,
    });
  }

  const contentSignals = parseContentSignals(robots.content);
  if (contentSignals.status !== "pass") {
    findings.push({
      pillar: "geo",
      category: "content_signals",
      severity: "low",
      title:
        contentSignals.status === "warning"
          ? "Content-Signal directive has issues"
          : "No Content-Signal directive in robots.txt",
      recommendation: contentSignals.explanation,
      fix_capability: "guided",
    });
  }

  return {
    score,
    crawlers,
    googlebotBlocked,
    sitemapReferenced,
    contentSignals,
    recommendedRobotsTxt,
    findings,
  };
}
