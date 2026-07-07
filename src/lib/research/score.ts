import { generateJson } from "@/lib/llm/client";
import { getLlmConfig } from "@/lib/llm/client";
import { addTokenUsage, emptyTokenUsage } from "@/lib/llm/usage";
import type { TokenUsageSummary } from "@/lib/llm/usage";
import type {
  IntentTier,
  ResearchContext,
  ResearchFinding,
  ScoredTopic,
} from "@/lib/research/types";
import { slugify, uniqueByTitle } from "@/lib/research/utils";

const MIN_SCORE = 45;

// C1 ranking: buyer intent first, then evidence strength. BOFU topics dominate
// the backlog whenever they exist — that's the point.
const TIER_RANK: Record<IntentTier, number> = { bofu: 0, mofu: 1, tofu: 2 };
const NO_TIER_RANK = 3;

/** An idea confirmed by two or more independent sources jumps the queue. */
const MULTI_SOURCE_BOOST = 15;

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
  if (finding.intentTier === "bofu") {
    score += 20;
  }
  if (finding.sourceType === "competitor_gap") {
    score += 10;
  }
  // C2: Google-verified demand (we already rank and get impressions) outranks
  // every guess-based source.
  if (finding.sourceType === "gsc_query") {
    score += 20;
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
      intentTier: finding.intentTier,
      thesis: finding.thesis,
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
    intentTier: finding.intentTier,
    thesis: finding.thesis,
  }));
}

/** Distinct source types that produced each title (by slug) — computed before
 * dedupe so cross-source confirmation isn't lost with the duplicates. */
function sourcesByTitle(findings: ResearchFinding[]) {
  const map = new Map<string, Set<string>>();
  for (const finding of findings) {
    const slug = slugify(finding.title);
    const set = map.get(slug) ?? new Set<string>();
    set.add(finding.sourceType);
    map.set(slug, set);
  }
  return map;
}

export async function scoreFindings(
  findings: ResearchFinding[],
  context: ResearchContext,
  opts: {
    /** C4 — learned per-sourceType multipliers (bounded 0.5–2.0), applied
     * before the MIN_SCORE cutoff so a losing source can fall out entirely. */
    sourceWeights?: Record<string, number>;
  } = {},
) {
  const sources = sourcesByTitle(findings);
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

  const seenSlugs = new Set<string>();
  const topics = rawScored
    .reduce<ScoredTopic[]>((eligible, topic) => {
      const slug = slugify(topic.title);
      // An idea two independent sources produced is more than the sum of its
      // scores — boost it before the cutoff so it can't fall below MIN_SCORE.
      const confirmations = sources.get(slug)?.size ?? 1;
      const weight = opts.sourceWeights?.[topic.sourceType] ?? 1;
      const score = Math.min(
        100,
        Math.round(topic.score * weight) + (confirmations >= 2 ? MULTI_SOURCE_BOOST : 0),
      );
      if (score < MIN_SCORE || seenSlugs.has(slug)) {
        return eligible;
      }
      seenSlugs.add(slug);
      eligible.push({ ...topic, score });
      return eligible;
    }, [])
    // Intent tier first (bofu > mofu > tofu > unknown), evidence strength second.
    .sort((a, b) => {
      const tierA = a.intentTier ? TIER_RANK[a.intentTier] : NO_TIER_RANK;
      const tierB = b.intentTier ? TIER_RANK[b.intentTier] : NO_TIER_RANK;
      return tierA - tierB || b.score - a.score;
    })
    .slice(0, 15);

  return { topics, tokenUsage };
}

export { MIN_SCORE };
