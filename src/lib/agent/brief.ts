import { and, desc, eq, gte } from "drizzle-orm";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import type { BrandScope } from "@/lib/brand/repository";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { getDb } from "@/lib/db";
import { brandProfiles } from "@/lib/db/schema/brand";
import { answerRuns, auditFindings, audits } from "@/lib/db/schema/visibility";
import { apexDomain } from "@/lib/visibility/answers";
import { getUsageTotals } from "@/lib/jobs/repository";
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { agentBriefPrompt } from "@/lib/llm/prompts";
import { logWarn } from "@/lib/logging/logger";
import { DAILY_RUN_SCHEDULE_LABEL } from "@/lib/workspace/settings";

/**
 * AP3: Claudia's standing brief: the short first-person narrative on the
 * Overview ("this week I published 2 articles, fixed 3 schema issues, your
 * score moved 61 → 68: next I'm …"). Assembled from structured run data,
 * written by the light LLM tier, refreshed by the daily job after each brand's
 * run settles. Cached in KV (derived + regenerated daily → never Postgres);
 * a KV miss falls back to a deterministic composition so the card always
 * renders. Unmetered: the brief is proof, and proof is never metered.
 */

export type AgentBrief = {
  text: string;
  generatedAt: string;
};

const BRIEF_TTL_SECONDS = 8 * 24 * 60 * 60; // survives a missed daily run
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const briefKey = (brandId: string) => `agent-brief:v1:${brandId}`;

export async function getStoredAgentBrief(brandId: string): Promise<AgentBrief | null> {
  return kvGetJson<AgentBrief>(briefKey(brandId));
}

type BriefFacts = {
  articlesThisWeek: number;
  publishedThisWeek: number;
  fixesThisWeek: number;
  score: number | null;
  scoreDelta: number | null;
  answersAppeared: number;
  answersTotal: number;
  pendingTopics: number;
};

/** Structured run data for the brief: pure reads, cheap enough to run daily. */
async function collectBriefFacts(scope: BrandScope): Promise<BriefFacts> {
  const db = getDb();
  const weekAgo = new Date(Date.now() - WEEK_MS);

  const [usage, pending, profile, workspaceAudits, resolvedFindings, recentAnswers] =
    await Promise.all([
      getUsageTotals(scope.brandId),
      listPendingTopicsForWriting(scope.brandId, 50),
      db.query.brandProfiles.findFirst({ where: eq(brandProfiles.brandId, scope.brandId) }),
      // kind = "owned": a competitor benchmark must never narrate as the owner's
      // score. Fetched with siteUrl so multi-brand/multi-site workspaces can be
      // narrowed to THIS brand's site below (another site's score must never
      // narrate as this brand's).
      db
        .select({ overall: audits.overallScore, siteUrl: audits.siteUrl })
        .from(audits)
        .where(
          and(
            eq(audits.workspaceId, scope.workspaceId),
            eq(audits.status, "complete"),
            eq(audits.kind, "owned"),
          ),
        )
        .orderBy(desc(audits.createdAt))
        .limit(20),
      // Findings carry no brand column: workspace-wide is the finest scope here.
      db
        .select({ id: auditFindings.id })
        .from(auditFindings)
        .where(
          and(
            eq(auditFindings.workspaceId, scope.workspaceId),
            eq(auditFindings.isResolved, true),
            gte(auditFindings.resolvedAt, weekAgo),
          ),
        ),
      db
        .select({ mentioned: answerRuns.brandMentioned })
        .from(answerRuns)
        .where(and(eq(answerRuns.brandId, scope.brandId), gte(answerRuns.ranAt, weekAgo))),
    ]);

  const brandApex = profile?.website ? apexDomain(profile.website) : "";
  const recentAudits = brandApex
    ? workspaceAudits.filter((a) => apexDomain(a.siteUrl) === brandApex)
    : workspaceAudits;
  const latest = recentAudits[0]?.overall ?? null;
  const previous = recentAudits[1]?.overall ?? null;
  return {
    articlesThisWeek: usage.thisWeek.articlesWritten,
    publishedThisWeek: usage.thisWeek.articlesPublished,
    fixesThisWeek: resolvedFindings.length,
    score: latest != null ? Math.round(latest) : null,
    scoreDelta:
      latest != null && previous != null ? Math.round(latest) - Math.round(previous) : null,
    answersAppeared: recentAnswers.filter((run) => run.mentioned).length,
    answersTotal: recentAnswers.length,
    pendingTopics: pending.length,
  };
}

function factsBlock(facts: BriefFacts): string {
  const lines = [
    `Articles written this week: ${facts.articlesThisWeek} (published: ${facts.publishedThisWeek})`,
    `Fixes applied/resolved this week: ${facts.fixesThisWeek}`,
    facts.score != null
      ? `Visibility score: ${facts.score}/100${facts.scoreDelta != null ? ` (${facts.scoreDelta >= 0 ? "+" : ""}${facts.scoreDelta} vs previous audit)` : ""}`
      : "Visibility score: no completed audit yet",
    facts.answersTotal > 0
      ? `AI answers this week: brand appeared in ${facts.answersAppeared} of ${facts.answersTotal} checked answers`
      : "AI answers: no answer check ran this week",
    `Topics queued to write next: ${facts.pendingTopics}`,
    `Run cadence: ${DAILY_RUN_SCHEDULE_LABEL}`,
  ];
  return lines.join("\n");
}

/** Always-works composition when the LLM is unavailable or returns nothing. */
function deterministicBrief(facts: BriefFacts): string {
  const parts: string[] = [];
  parts.push(
    facts.articlesThisWeek > 0
      ? `This week I wrote ${facts.articlesThisWeek} article${facts.articlesThisWeek === 1 ? "" : "s"}`
      : "I'm lining up what to write next",
  );
  if (facts.fixesThisWeek > 0) {
    parts.push(`fixed ${facts.fixesThisWeek} issue${facts.fixesThisWeek === 1 ? "" : "s"} on your site`);
  }
  if (facts.score != null) {
    parts.push(
      facts.scoreDelta != null && facts.scoreDelta !== 0
        ? `your visibility score moved to ${facts.score} (${facts.scoreDelta > 0 ? "+" : ""}${facts.scoreDelta})`
        : `your visibility score is holding at ${facts.score}`,
    );
  }
  const summary = `${parts.join(", ")}.`;
  const next =
    facts.pendingTopics > 0
      ? ` Next up: ${facts.pendingTopics} topic${facts.pendingTopics === 1 ? "" : "s"} queued to write.`
      : "";
  return summary + next;
}

/**
 * Rebuild the brand's brief from fresh run data and cache it. Called by the
 * daily job after settle (best-effort) and by the API on a cold cache. Never
 * throws: a failed LLM call falls back to the deterministic composition.
 */
export async function refreshAgentBrief(
  scope: BrandScope,
  brandName: string,
): Promise<AgentBrief> {
  const facts = await collectBriefFacts(scope);
  let text = deterministicBrief(facts);

  if (getLlmConfig()) {
    try {
      const prompt = agentBriefPrompt(brandName, factsBlock(facts));
      const { data } = await generateJson<{ brief?: unknown }>("light", [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ]);
      if (typeof data?.brief === "string" && data.brief.trim()) {
        text = data.brief.trim().slice(0, 2000);
      }
    } catch (error) {
      logWarn("agent_brief.llm_failed", {
        brandId: scope.brandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const brief: AgentBrief = { text, generatedAt: new Date().toISOString() };
  await kvPutJson(briefKey(scope.brandId), brief, BRIEF_TTL_SECONDS);
  return brief;
}
