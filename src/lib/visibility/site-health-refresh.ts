import { kvPutJson } from "@/lib/cloudflare/kv";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import { fetchLlmsTxt } from "@/lib/visibility/llms";
import { fetchPageSpeed } from "@/lib/visibility/pagespeed";
import { fetchPageResilient } from "@/lib/visibility/resilient-fetch";
import { fetchRobots } from "@/lib/visibility/robots";
import { buildSiteHealth, type SiteHealthSnapshot } from "@/lib/visibility/site-health";
import { crawlSitemap } from "@/lib/visibility/sitemap";

/**
 * Live Site Health recompute, shared by the manual "Refresh checks" endpoint
 * and Claudia's weekly autonomous check. Fetches the homepage + robots +
 * sitemap + llms.txt + PageSpeed, builds the snapshot, stores it as the KV
 * overlay (ephemeral per the caching rule) and queues any new findings.
 */

export const SITE_HEALTH_OVERLAY_TTL_SECONDS = 7 * 86_400;
/** A refresh only counts sitemap pages; no need to enumerate more. */
const SITEMAP_COUNT_CAP = 50;

export const siteHealthOverlayKey = (workspaceId: string) => `site-health:${workspaceId}`;

/** The site itself couldn't be fetched: callers decide how to surface it. */
export class SiteUnreachableError extends Error {}

export async function refreshSiteHealth(
  workspaceId: string,
  siteUrl: string,
  source: "refresh" | "agent",
): Promise<SiteHealthSnapshot> {
  const { snapshot: homepage, render } = await fetchPageResilient(siteUrl);
  if (homepage.status_code === null || homepage.status_code >= 400) {
    throw new SiteUnreachableError(
      homepage.errors[0] ?? `Your homepage returned status ${homepage.status_code}`,
    );
  }
  const robots = await fetchRobots(siteUrl);
  const [sitemapPages, llms, psi] = await Promise.all([
    crawlSitemap(siteUrl, SITEMAP_COUNT_CAP, { sitemaps: robots.sitemaps }),
    fetchLlmsTxt(siteUrl),
    fetchPageSpeed(homepage.url),
  ]);

  const health = await buildSiteHealth({
    homepage,
    robots,
    llms,
    sitemapPageCount: sitemapPages.length,
    render,
    psi,
    source,
  });
  const snapshot: SiteHealthSnapshot = health.snapshot;

  await kvPutJson(siteHealthOverlayKey(workspaceId), snapshot, SITE_HEALTH_OVERLAY_TTL_SECONDS);
  // Failing checks land in the fix queue too; dedup keeps reruns clean.
  if (health.findings.length > 0) {
    await persistNewFindings(workspaceId, health.findings, {});
  }
  return snapshot;
}
