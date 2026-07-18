import { z } from "zod";
import { generateJson } from "@/lib/llm/client";
import type { ResearchContext, ResearchFinding, ResearchProvider } from "@/lib/research/types";
import { getLlmConfig } from "@/lib/llm/client";

type QueryResponse = {
  queries: Array<{
    query: string;
    intent: string;
    title?: string;
  }>;
};

const queryResponseSchema: z.ZodType<QueryResponse> = z.object({
  queries: z.array(z.object({
    query: z.string().min(1).max(500),
    intent: z.string().max(500),
    title: z.string().min(1).max(300).optional(),
  })).max(12),
});

export const trendQueryProvider: ResearchProvider = {
  id: "trend_query",
  isAvailable() {
    return Boolean(getLlmConfig());
  },
  async discover(context: ResearchContext) {
    const seedKeywords = context.brand.seedKeywords ?? "content marketing";
    const result = await generateJson("light", [
      {
        role: "system",
        content:
          "You discover emerging search-style questions people ask. Return JSON with a queries array.",
      },
      {
        role: "user",
        content: `Generate 6 question-style search queries and article titles.

Product: ${context.brand.productDescription ?? "Unknown"}
Audience: ${context.brand.audience ?? "General"}
Seed keywords: ${seedKeywords}

Each query should look like autocomplete or People Also Ask phrasing.`,
      },
    ], { schema: queryResponseSchema });

    const queries = Array.isArray(result.data?.queries) ? result.data.queries : [];
    return queries
      .map((item): ResearchFinding | null => {
        // The model occasionally omits "title"; fall back to the query so we
        // don't emit a finding with an undefined title.
        const title = item.title?.trim() || item.query?.trim();
        if (!title) {
          return null;
        }
        return {
          title,
          query: item.query,
          source: "Trend & question discovery",
          sourceType: "trend_query" as const,
          evidenceUrls: [],
          snippet: item.intent,
        };
      })
      .filter((finding): finding is ResearchFinding => finding !== null);
  },
};
