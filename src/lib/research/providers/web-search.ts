import type { ResearchContext, ResearchFinding, ResearchProvider } from "@/lib/research/types";
import { serperSearch } from "@/lib/research/serper";
import { buildSeedQueries } from "@/lib/research/utils";

async function searchSerper(query: string): Promise<ResearchFinding[]> {
  const { organic, peopleAlsoAsk } = await serperSearch(query, { num: 5 });
  const findings: ResearchFinding[] = [];

  for (const item of organic) {
    if (!item.title) {
      continue;
    }
    findings.push({
      title: item.title,
      query,
      source: "Web search (Serper)",
      sourceType: "web_search",
      evidenceUrls: item.link ? [item.link] : [],
      evidenceSources: item.link
        ? [{
            url: item.link,
            title: item.title,
            excerpt: item.snippet,
            sourceType: "web_search",
            sourceLabel: "Web search (Serper)",
            query,
          }]
        : [],
      snippet: item.snippet,
    });
  }

  for (const item of peopleAlsoAsk) {
    if (!item.question) {
      continue;
    }
    findings.push({
      title: item.question.endsWith("?") ? item.question : `${item.question}?`,
      query: item.question,
      source: "People Also Ask",
      sourceType: "web_search",
      evidenceUrls: item.link ? [item.link] : [],
      evidenceSources: item.link
        ? [{
            url: item.link,
            title: item.question,
            excerpt: item.snippet,
            sourceType: "web_search",
            sourceLabel: "People Also Ask",
            query: item.question,
          }]
        : [],
      snippet: item.snippet,
    });
  }

  return findings;
}

async function searchTavily(query: string): Promise<ResearchFinding[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return [];
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (payload.results ?? []).flatMap((item) =>
    item.title
      ? [
          {
            title: item.title,
            query,
            source: "Web search (Tavily)",
            sourceType: "web_search" as const,
            evidenceUrls: item.url ? [item.url] : [],
            evidenceSources: item.url
              ? [{
                  url: item.url,
                  title: item.title,
                  excerpt: item.content,
                  sourceType: "web_search" as const,
                  sourceLabel: "Web search (Tavily)",
                  query,
                }]
              : [],
            snippet: item.content,
          },
        ]
      : [],
  );
}

export const webSearchProvider: ResearchProvider = {
  id: "web_search",
  isAvailable() {
    return Boolean(process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY);
  },
  async discover(context: ResearchContext) {
    const queries = context.seedQueries;
    const findingsByQuery = await Promise.all(
      queries.slice(0, 4).map(async (query) => {
        const serper = await searchSerper(query);
        const tavily = serper.length > 0 ? [] : await searchTavily(query);
        return [...serper, ...tavily];
      }),
    );

    return findingsByQuery.flat();
  },
};

// Free, keyless keyword-idea source. Google's suggest endpoint returns
// `[query, [suggestion, ...]]` when called with `client=firefox`.
const DEFAULT_AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search";

async function fetchAutocomplete(query: string, baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(
      `${baseUrl}?client=firefox&q=${encodeURIComponent(query)}`,
    );
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as [string, string[]?];
    return Array.isArray(payload?.[1]) ? payload[1] : [];
  } catch {
    // Suggest endpoint is best-effort; never let it break a research run.
    return [];
  }
}

export const keywordProvider: ResearchProvider = {
  id: "keyword_api",
  isAvailable() {
    // No API key required; relies on Google Autocomplete (free).
    return true;
  },
  async discover(context: ResearchContext) {
    const baseUrl = process.env.KEYWORD_API_URL?.trim() || DEFAULT_AUTOCOMPLETE_URL;
    const queries = (
      context.seedQueries.length > 0 ? context.seedQueries : ["seo"]
    ).slice(0, 3);

    const findings: ResearchFinding[] = [];
    const seen = new Set<string>();

    const suggestionsByQuery = await Promise.all(
      queries.map(async (query) => fetchAutocomplete(query, baseUrl)),
    );

    for (const suggestions of suggestionsByQuery) {
      for (const keyword of suggestions.slice(0, 6)) {
        const normalized = keyword.trim().toLowerCase();
        if (!normalized || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        findings.push({
          title: `Guide to ${keyword}`,
          query: keyword,
          source: "Google Autocomplete",
          sourceType: "keyword_api",
          evidenceUrls: [],
        });
      }
    }

    return findings;
  },
};

export function buildResearchContext(
  brand: ResearchContext["brand"],
  competitors: ResearchContext["competitors"],
  extras: Partial<Pick<ResearchContext, "useCases" | "ourTitles" | "scope">> = {},
): ResearchContext {
  return {
    brand,
    competitors,
    seedQueries: buildSeedQueries(brand),
    useCases: extras.useCases ?? [],
    ourTitles: extras.ourTitles ?? [],
    scope: extras.scope,
  };
}
