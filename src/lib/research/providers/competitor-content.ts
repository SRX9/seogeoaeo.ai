import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { competitorContent } from "@/lib/db/schema";
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { competitorContentClassifyPrompt } from "@/lib/llm/prompts";
import { extractFeedItems } from "@/lib/research/providers/rss-sitemap";
import type {
  IntentTier,
  ResearchContext,
  ResearchFinding,
  ResearchProvider,
} from "@/lib/research/types";
import { extractXmlValues, fetchText } from "@/lib/research/utils";

/**
 * C1 competitor content mining: competitors already spent money discovering
 * which topics work. Crawl their blogs incrementally, classify each post once,
 * and emit the topics they cover that we don't: as *our* topic with *our*
 * angle. Binding rule: their titles/text never reach a writing prompt; only
 * the topic cluster and intent do.
 */

const MAX_URLS_PER_COMPETITOR = 20;
const MAX_CLASSIFY_BATCH = 40;
/** A topic needs this many competitor posts before it counts as validated demand. */
const MIN_CLUSTER_SIZE = 2;
const MAX_GAP_FINDINGS = 8;

type CrawledPost = { competitorName: string; url: string; title: string };

async function crawlCompetitor(
  competitor: ResearchContext["competitors"][number],
): Promise<CrawledPost[]> {
  const posts = new Map<string, CrawledPost>();

  if (competitor.rssUrl) {
    const xml = await fetchText(competitor.rssUrl);
    if (xml) {
      for (const item of extractFeedItems(xml).slice(0, MAX_URLS_PER_COMPETITOR)) {
        if (item.link) {
          posts.set(item.link, {
            competitorName: competitor.name,
            url: item.link,
            title: item.title,
          });
        }
      }
    }
  }

  const sitemapUrl = competitor.sitemapUrl ?? `${competitor.url.replace(/\/$/, "")}/sitemap.xml`;
  const xml = await fetchText(sitemapUrl);
  if (xml) {
    for (const url of extractXmlValues(xml, "loc").slice(0, MAX_URLS_PER_COMPETITOR)) {
      if (posts.has(url)) continue;
      const slug = url.split("/").filter(Boolean).pop() ?? "";
      const title = slug.replace(/\.(html?|php)$/i, "").replace(/[-_]/g, " ").trim();
      if (title.length < 8) continue;
      posts.set(url, {
        competitorName: competitor.name,
        url,
        title: title.charAt(0).toUpperCase() + title.slice(1),
      });
    }
  }

  return [...posts.values()];
}

type Classification = { url: string; topic?: string; intent?: string; shape?: string };

async function classifyPosts(context: ResearchContext, posts: CrawledPost[]) {
  const byUrl = new Map<string, Classification>();
  if (!getLlmConfig() || posts.length === 0) {
    return byUrl;
  }
  const prompt = competitorContentClassifyPrompt(
    context.brand,
    posts.slice(0, MAX_CLASSIFY_BATCH).map((post) => ({ url: post.url, title: post.title })),
  );
  try {
    const { data } = await generateJson<{ posts?: Classification[] }>("light", [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    for (const item of data?.posts ?? []) {
      if (item.url) byUrl.set(item.url, item);
    }
  } catch {
    // Classification is best-effort; unclassified rows still count for the diff.
  }
  return byUrl;
}

function normalizeIntent(value: string | undefined): IntentTier | null {
  return value === "bofu" || value === "mofu" || value === "tofu" ? value : null;
}

/** Head terms our titles must share with a topic before it counts as covered. */
export function coversTopic(ourTitles: string[], topic: string) {
  const terms = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 3);
  if (terms.length === 0) return true; // unusable topic: don't emit noise
  return ourTitles.some((title) => {
    const haystack = title.toLowerCase();
    const matched = terms.filter((term) => haystack.includes(term)).length;
    return matched >= Math.ceil(terms.length / 2);
  });
}

export const competitorContentProvider: ResearchProvider = {
  id: "competitor_content",
  isAvailable() {
    return true;
  },
  async discover(context: ResearchContext) {
    const scope = context.scope;
    if (!scope || context.competitors.length === 0) {
      return [];
    }
    const db = getDb();

    const crawled = (
      await Promise.all(context.competitors.map((competitor) => crawlCompetitor(competitor)))
    ).flat();
    if (crawled.length === 0) {
      return [];
    }

    const known = await db
      .select()
      .from(competitorContent)
      .where(eq(competitorContent.brandId, scope.brandId));
    const knownUrls = new Set(known.map((row) => row.url));
    // Known rows that were persisted without a topic (crawled during an LLM
    // outage) get retried: otherwise they'd be poisoned forever: never "fresh"
    // again, so never re-classified, and null-topic rows never join a cluster.
    const knownUnclassified = new Set(known.filter((row) => !row.topic).map((row) => row.url));

    // Incremental: only never-seen (or still-unclassified) posts hit the LLM.
    // A fresh post is itself a signal: "they just started covering X".
    const fresh = crawled.filter((post) => !knownUrls.has(post.url));
    const needsTopic = crawled.filter(
      (post) => !knownUrls.has(post.url) || knownUnclassified.has(post.url),
    );
    const classified = await classifyPosts(context, needsTopic);

    // One batched upsert instead of a round-trip per post. COALESCE keeps an
    // existing classification when this run has none for the row (LLM down),
    // and fills it in when a retry finally classifies an old null-topic row.
    const now = new Date();
    await db
      .insert(competitorContent)
      .values(
        crawled.map((post) => {
          const classification = classified.get(post.url);
          return {
            workspaceId: scope.workspaceId,
            brandId: scope.brandId,
            competitorName: post.competitorName,
            url: post.url,
            title: post.title,
            topic: classification?.topic?.toLowerCase().trim() || null,
            intent: normalizeIntent(classification?.intent),
            shape: classification?.shape ?? null,
            firstSeen: now,
            lastSeen: now,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [competitorContent.brandId, competitorContent.url],
        set: {
          lastSeen: now,
          title: sql`excluded.title`,
          topic: sql`coalesce(excluded.topic, ${competitorContent.topic})`,
          intent: sql`coalesce(excluded.intent, ${competitorContent.intent})`,
          shape: sql`coalesce(excluded.shape, ${competitorContent.shape})`,
        },
      });

    // Gap diff over the whole index (old + new), clustered by topic.
    const allRows = await db
      .select()
      .from(competitorContent)
      .where(eq(competitorContent.brandId, scope.brandId))
      .orderBy(sql`${competitorContent.firstSeen} desc`);

    type Cluster = {
      topic: string;
      count: number;
      competitors: Set<string>;
      intents: IntentTier[];
      urls: string[];
      hasFresh: boolean;
    };
    const clusters = new Map<string, Cluster>();
    const freshUrls = new Set(fresh.map((post) => post.url));
    for (const row of allRows) {
      if (!row.topic) continue;
      const cluster = clusters.get(row.topic) ?? {
        topic: row.topic,
        count: 0,
        competitors: new Set<string>(),
        intents: [],
        urls: [],
        hasFresh: false,
      };
      cluster.count += 1;
      cluster.competitors.add(row.competitorName);
      const intent = normalizeIntent(row.intent ?? undefined);
      if (intent) cluster.intents.push(intent);
      if (cluster.urls.length < 3) cluster.urls.push(row.url);
      if (freshUrls.has(row.url)) cluster.hasFresh = true;
      clusters.set(row.topic, cluster);
    }

    // Popularity proxy v1: cluster size (they keep investing in what works),
    // with a recency boost for topics they just started covering. Internal-link
    // counts and V5.5 answer-citation hits slot in here when those land.
    const gaps = [...clusters.values()]
      .filter(
        (cluster) => cluster.count >= MIN_CLUSTER_SIZE && !coversTopic(context.ourTitles, cluster.topic),
      )
      .sort((a, b) => Number(b.hasFresh) - Number(a.hasFresh) || b.count - a.count)
      .slice(0, MAX_GAP_FINDINGS);

    return gaps.map((cluster): ResearchFinding => {
      const who = [...cluster.competitors].join(", ");
      const majorityIntent = cluster.intents.sort().at(cluster.intents.length >> 1) ?? "mofu";
      return {
        // The topic cluster only: never a competitor headline to paraphrase.
        // The angle rule: our version states our use case, our data, our take.
        title: `${cluster.topic.charAt(0).toUpperCase()}${cluster.topic.slice(1)}: our take`,
        query: cluster.topic,
        source: `Competitor gap (${who})`,
        sourceType: "competitor_gap",
        evidenceUrls: cluster.urls,
        snippet: `Write from our angle: our use case, our numbers, our opinion. Never reuse their framing.`,
        intentTier: majorityIntent,
        thesis: cluster.hasFresh
          ? `${who} recently published ${cluster.count} posts about "${cluster.topic}". We do not have an article on that topic yet.`
          : `${who} has ${cluster.count} posts on "${cluster.topic}"; we have 0. Demand they already validated.`,
      };
    });
  },
};
