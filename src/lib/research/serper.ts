/**
 * Shared Serper (google.serper.dev) client. One place that knows how to call the
 * search API, so the research provider and the brand-enrichment features don't
 * each hand-roll the request. Always resolves — returns an empty result when the
 * key is missing or the request fails, so callers can degrade gracefully.
 */

export type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
};

export type SerperPeopleAlsoAsk = {
  question?: string;
  snippet?: string;
  link?: string;
};

export type SerperKnowledgeGraph = {
  title?: string;
  type?: string;
  website?: string;
  description?: string;
  attributes?: Record<string, string>;
};

export type SerperResult = {
  organic: SerperOrganic[];
  peopleAlsoAsk: SerperPeopleAlsoAsk[];
  knowledgeGraph: SerperKnowledgeGraph | null;
};

const EMPTY: SerperResult = { organic: [], peopleAlsoAsk: [], knowledgeGraph: null };

export function isSerperConfigured() {
  return Boolean(process.env.SERPER_API_KEY);
}

export async function serperSearch(
  query: string,
  opts?: { num?: number },
): Promise<SerperResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || !query.trim()) {
    return EMPTY;
  }

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: opts?.num ?? 5 }),
    });

    if (!response.ok) {
      return EMPTY;
    }

    const payload = (await response.json()) as {
      organic?: SerperOrganic[];
      peopleAlsoAsk?: SerperPeopleAlsoAsk[];
      knowledgeGraph?: SerperKnowledgeGraph;
    };

    return {
      organic: payload.organic ?? [],
      peopleAlsoAsk: payload.peopleAlsoAsk ?? [],
      knowledgeGraph: payload.knowledgeGraph ?? null,
    };
  } catch {
    // Network/JSON failures must never break a research run or a prefill.
    return EMPTY;
  }
}
