import { rssProvider, sitemapProvider } from "@/lib/research/providers/rss-sitemap";
import { trendQueryProvider } from "@/lib/research/providers/trend-query";
import {
  buildResearchContext,
  keywordProvider,
  webSearchProvider,
} from "@/lib/research/providers/web-search";
import type { ResearchProvider } from "@/lib/research/types";

export const researchProviders: ResearchProvider[] = [
  webSearchProvider,
  rssProvider,
  sitemapProvider,
  trendQueryProvider,
  keywordProvider,
];

export { buildResearchContext };
