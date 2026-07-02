import { DEFAULT_HEADERS } from "./fetch-page";
import type { AiCrawlerStatus, RobotsResult, RobotsRule } from "./types";

/**
 * V0.2 — robots.txt fetcher + AI-crawler classifier. Port of
 * `fetch_robots_txt()` from `inspiration-code/scripts/fetch_page.py`,
 * including the 14-crawler list and the status state machine, verbatim.
 */

export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "CCBot",
  "Bytespider",
  "cohere-ai",
  "Google-Extended",
  "GoogleOther",
  "Applebot-Extended",
  "FacebookBot",
  "Amazonbot",
] as const;

/** Parse robots.txt content into per-agent rules + sitemap URLs. */
export function parseRobots(content: string): {
  agentRules: Record<string, RobotsRule[]>;
  sitemaps: string[];
} {
  const agentRules: Record<string, RobotsRule[]> = {};
  const sitemaps: string[] = [];
  let currentAgent: string | null = null;

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      currentAgent = line.slice(line.indexOf(":") + 1).trim();
      agentRules[currentAgent] ??= [];
    } else if (lower.startsWith("disallow:") && currentAgent) {
      agentRules[currentAgent].push({
        directive: "Disallow",
        path: line.slice(line.indexOf(":") + 1).trim(),
      });
    } else if (lower.startsWith("allow:") && currentAgent) {
      agentRules[currentAgent].push({
        directive: "Allow",
        path: line.slice(line.indexOf(":") + 1).trim(),
      });
    } else if (lower.startsWith("sitemap:")) {
      // slice after the first ":" would cut "https" URLs at the scheme colon in
      // the Python original; splitting on the directive colon only avoids that.
      let sitemapUrl = line.slice("sitemap:".length).trim();
      if (!sitemapUrl.startsWith("http")) sitemapUrl = "http" + sitemapUrl;
      sitemaps.push(sitemapUrl);
    }
  }
  return { agentRules, sitemaps };
}

/** The exact status state machine from fetch_page.py lines 267–297. */
export function classifyCrawlers(
  agentRules: Record<string, RobotsRule[]>,
): Record<string, AiCrawlerStatus> {
  const status: Record<string, AiCrawlerStatus> = {};
  for (const crawler of AI_CRAWLERS) {
    const rules = agentRules[crawler];
    if (rules) {
      if (rules.some((r) => r.directive === "Disallow" && r.path === "/")) {
        status[crawler] = "BLOCKED";
      } else if (rules.some((r) => r.directive === "Disallow" && r.path)) {
        status[crawler] = "PARTIALLY_BLOCKED";
      } else {
        status[crawler] = "ALLOWED";
      }
    } else if (agentRules["*"]) {
      const wildcard = agentRules["*"];
      if (wildcard.some((r) => r.directive === "Disallow" && r.path === "/")) {
        status[crawler] = "BLOCKED_BY_WILDCARD";
      } else {
        status[crawler] = "ALLOWED_BY_DEFAULT";
      }
    } else {
      status[crawler] = "NOT_MENTIONED";
    }
  }
  return status;
}

export async function fetchRobots(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RobotsResult> {
  const { origin } = new URL(url);
  const robotsUrl = `${origin}/robots.txt`;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const result: RobotsResult = {
    url: robotsUrl,
    exists: false,
    content: "",
    agent_rules: {},
    ai_crawler_status: {},
    sitemaps: [],
    errors: [],
  };

  try {
    const response = await fetchImpl(robotsUrl, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (response.status === 200) {
      result.exists = true;
      result.content = await response.text();
      const { agentRules, sitemaps } = parseRobots(result.content);
      result.agent_rules = agentRules;
      result.sitemaps = sitemaps;
      result.ai_crawler_status = classifyCrawlers(agentRules);
    } else if (response.status === 404) {
      result.errors.push("No robots.txt found (404)");
      for (const crawler of AI_CRAWLERS) {
        result.ai_crawler_status[crawler] = "NO_ROBOTS_TXT";
      }
    } else {
      result.errors.push(`Unexpected status code: ${response.status}`);
    }
  } catch (error) {
    result.errors.push(
      `Error fetching robots.txt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}
