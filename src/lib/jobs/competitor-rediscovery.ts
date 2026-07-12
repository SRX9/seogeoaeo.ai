import { and, desc, eq } from "drizzle-orm";
import { visibilityCapsForPlan } from "@/lib/billing/plans";
import { discoverCompetitors } from "@/lib/brand/enrich";
import {
  createCompetitor,
  getBrand,
  getBrandProfile,
  listCompetitors,
  type BrandScope,
} from "@/lib/brand/repository";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";
import { getDb } from "@/lib/db";
import { agentJobs } from "@/lib/db/schema";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { recentAnswerExcerpts } from "@/lib/visibility/answers";

/**
 * Periodic competitor rediscovery (autopilot). Every REDISCOVERY_INTERVAL_DAYS
 * the daily pipeline re-runs evidence-based discovery for the brand: answer
 * runs keep accumulating, so the evidence only gets better: and auto-adds new
 * rivals up to the plan's competitor cap. The cadence gate is the most recent
 * `competitor_rediscovery` agent job, so a retried day never double-runs, and
 * the run itself is plan-included (no credits).
 */

export const REDISCOVERY_INTERVAL_DAYS = 15;

export type RediscoveryResult =
  | { ran: false; reason: "no_plan_cap" | "at_cap" | "too_soon" | "no_brand" }
  | { ran: true; added: number };

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function lastRediscoveryAt(brandId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: agentJobs.createdAt })
    .from(agentJobs)
    .where(and(eq(agentJobs.brandId, brandId), eq(agentJobs.kind, "competitor_rediscovery")))
    .orderBy(desc(agentJobs.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

export async function maybeRediscoverCompetitors(
  scope: BrandScope,
  planId: string | null | undefined,
  now: Date = new Date(),
): Promise<RediscoveryResult> {
  const cap = Math.min(visibilityCapsForPlan(planId).competitors, MAX_COMPETITORS);
  if (cap <= 0) {
    return { ran: false, reason: "no_plan_cap" };
  }

  const existing = await listCompetitors(scope.brandId);
  const slots = cap - existing.length;
  if (slots <= 0) {
    return { ran: false, reason: "at_cap" };
  }

  const last = await lastRediscoveryAt(scope.brandId);
  if (last && now.getTime() - last.getTime() < REDISCOVERY_INTERVAL_DAYS * 24 * 60 * 60 * 1000) {
    return { ran: false, reason: "too_soon" };
  }

  const [brand, profile] = await Promise.all([
    getBrand(scope.workspaceId, scope.brandId),
    getBrandProfile(scope.brandId),
  ]);
  if (!brand) {
    return { ran: false, reason: "no_brand" };
  }

  // The job row doubles as the cadence marker: created before the search so a
  // failed run still waits out the interval instead of retrying daily.
  const job = await createAgentJob(scope, "competitor_rediscovery", "Scanning for new competitors");
  try {
    const answerExcerpts = await recentAnswerExcerpts(scope.brandId);
    // Ask for extra suggestions so filtering out already-tracked rivals still
    // leaves enough to fill the open slots.
    const suggestions = await discoverCompetitors(
      {
        name: brand.name,
        website: profile?.website,
        productDescription: profile?.productDescription,
        seedKeywords: profile?.seedKeywords,
        answerExcerpts,
      },
      Math.min(10, slots + existing.length),
    );

    const knownHosts = new Set(
      existing.map((c) => hostOf(c.url)).filter((h): h is string => Boolean(h)),
    );
    const fresh = suggestions
      .filter((s) => {
        const host = hostOf(s.url);
        return host ? !knownHosts.has(host) : false;
      })
      .slice(0, slots);

    for (const suggestion of fresh) {
      await createCompetitor(scope, {
        name: suggestion.name,
        url: suggestion.url,
        rssUrl: "",
        sitemapUrl: "",
      });
    }

    await finishAgentJob(
      job.id,
      "completed",
      fresh.length
        ? `Found ${fresh.length} new competitor${fresh.length === 1 ? "" : "s"}: ${fresh.map((f) => f.name).join(", ")}.`
        : "No new competitors found. Your current list is up to date.",
      { added: fresh.length, names: fresh.map((f) => f.name) },
    );
    return { ran: true, added: fresh.length };
  } catch (error) {
    await finishAgentJob(job.id, "failed", "Competitor scan failed.");
    throw error;
  }
}
