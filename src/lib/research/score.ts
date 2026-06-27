import { generateJson } from "@/lib/llm/client";
import { getLlmConfig } from "@/lib/llm/client";
import { addTokenUsage, emptyTokenUsage } from "@/lib/llm/usage";
import type { TokenUsageSummary } from "@/lib/llm/usage";
import type { ResearchContext, ResearchFinding, ScoredTopic } from "@/lib/research/types";
import { slugify, uniqueByTitle } from "@/lib/research/utils";

const MIN_SCORE = 45;

type ScoreBatchResponse = {
  topics: Array<{
    title: string;
    score: number;
    rationale: string;
    answerFit: string;
    angle?: string;
    keywords?: string;
  }>;
};

function heuristicScore(finding: ResearchFinding, context: ResearchContext) {
  let score = 50;
  const seed = (context.brand.seedKeywords ?? "").toLowerCase();
  const title = finding.title.toLowerCase();

  if (seed && seed.split(",").some((keyword) => title.includes(keyword.trim()))) {
    score += 15;
  }
  if (finding.sourceType === "trend_query") {
    score += 12;
  }
  if (finding.sourceType === "web_search") {
    score += 10;
  }
  if (finding.query?.includes("?")) {
    score += 8;
  }
  if (finding.evidenceUrls.length > 0) {
    score += 5;
  }
  return Math.min(score, 95);
}

async function scoreWithLlm(findings: ResearchFinding[], context: ResearchContext) {
  const result = await generateJson<ScoreBatchResponse>("light", [
    {
      role: "system",
      content:
        "Score article topic ideas for an SEO SaaS. Return JSON with topics array including title, score (0-100), rationale, answerFit, angle, keywords.",
    },
    {
      role: "user",
      content: `Brand product: ${context.brand.productDescription ?? "N/A"}
Audience: ${context.brand.audience ?? "N/A"}
Seed keywords: ${context.brand.seedKeywords ?? "N/A"}

Score these findings for relevance, freshness, and product-as-answer fit:
${JSON.stringify(findings.slice(0, 20), null, 2)}`,
    },
  ]);

  const scoredTopics = Array.isArray(result.data?.topics) ? result.data.topics : [];
  const byTitle = new Map(scoredTopics.map((topic) => [topic.title.toLowerCase(), topic]));

  const topics = findings.map((finding) => {
    const scored = byTitle.get(finding.title.toLowerCase());
    const score = scored?.score ?? heuristicScore(finding, context);
    return {
      title: finding.title,
      angle: scored?.angle ?? finding.snippet,
      keywords: scored?.keywords ?? finding.query,
      score,
      rationale: scored?.rationale ?? `Recommended from ${finding.source}.`,
      answerFit: scored?.answerFit ?? "Moderate fit based on brand context.",
      source: finding.source,
      sourceType: finding.sourceType,
      evidenceUrls: finding.evidenceUrls,
      query: finding.query,
    } satisfies ScoredTopic;
  });

  return {
    topics,
    tokenUsage: addTokenUsage(emptyTokenUsage(), result),
  };
}

function scoreHeuristically(findings: ResearchFinding[], context: ResearchContext): ScoredTopic[] {
  return findings.map((finding) => ({
    title: finding.title,
    angle: finding.snippet,
    keywords: finding.query,
    score: heuristicScore(finding, context),
    rationale: `Recommended from ${finding.source}.`,
    answerFit: finding.query
      ? "Emerging query where the product can provide a practical answer."
      : "Relevant competitor or search gap topic.",
    source: finding.source,
    sourceType: finding.sourceType,
    evidenceUrls: finding.evidenceUrls,
    query: finding.query,
  }));
}

export async function scoreFindings(findings: ResearchFinding[], context: ResearchContext) {
  const unique = uniqueByTitle(findings);
  let tokenUsage: TokenUsageSummary = emptyTokenUsage();
  let rawScored: ScoredTopic[];

  if (getLlmConfig()) {
    const llmScored = await scoreWithLlm(unique, context);
    rawScored = llmScored.topics;
    tokenUsage = llmScored.tokenUsage;
  } else {
    rawScored = scoreHeuristically(unique, context);
  }

  const topics = rawScored
    .filter((topic) => topic.score >= MIN_SCORE)
    .filter((topic, index, list) => {
      const slug = slugify(topic.title);
      return list.findIndex((item) => slugify(item.title) === slug) === index;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  return { topics, tokenUsage };
}

export { MIN_SCORE };
