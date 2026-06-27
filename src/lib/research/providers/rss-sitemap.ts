import type { ResearchContext, ResearchFinding, ResearchProvider } from "@/lib/research/types";
import { extractXmlValues, fetchText } from "@/lib/research/utils";

// Parse per-item so each title pairs with its own link, and channel-level
// title/link are ignored. Supports RSS <item> and Atom <entry>/<link href>.
function extractFeedItems(xml: string) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  return blocks
    .map((block) => {
      const title = extractXmlValues(block, "title")[0] ?? "";
      let link: string | null = extractXmlValues(block, "link")[0] ?? null;
      if (!link) {
        link = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
      }
      return { title: title.trim(), link };
    })
    .filter((item) => item.title);
}

export const rssProvider: ResearchProvider = {
  id: "rss",
  isAvailable() {
    return true;
  },
  async discover(context: ResearchContext) {
    const findings: ResearchFinding[] = [];

    for (const competitor of context.competitors) {
      if (!competitor.rssUrl) {
        continue;
      }
      const xml = await fetchText(competitor.rssUrl);
      if (!xml) {
        continue;
      }
      for (const item of extractFeedItems(xml).slice(0, 5)) {
        findings.push({
          title: item.title,
          source: `${competitor.name} RSS`,
          sourceType: "rss",
          evidenceUrls: item.link ? [item.link] : [competitor.rssUrl!],
          snippet: `Recent competitor content from ${competitor.name}`,
        });
      }
    }

    return findings;
  },
};

export const sitemapProvider: ResearchProvider = {
  id: "sitemap",
  isAvailable() {
    return true;
  },
  async discover(context: ResearchContext) {
    const findings: ResearchFinding[] = [];

    for (const competitor of context.competitors) {
      const sitemapUrl = competitor.sitemapUrl ?? `${competitor.url.replace(/\/$/, "")}/sitemap.xml`;
      const xml = await fetchText(sitemapUrl);
      if (!xml) {
        continue;
      }
      const urls = extractXmlValues(xml, "loc").slice(0, 8);
      for (const url of urls) {
        const slug = url.split("/").filter(Boolean).pop() ?? url;
        const title = slug.replace(/[-_]/g, " ");
        if (title.length < 8) {
          continue;
        }
        findings.push({
          title: title.charAt(0).toUpperCase() + title.slice(1),
          source: `${competitor.name} sitemap`,
          sourceType: "sitemap",
          evidenceUrls: [url],
          snippet: `Discovered from ${competitor.name} sitemap`,
        });
      }
    }

    return findings;
  },
};
