import { competitorContentProvider } from "@/lib/research/providers/competitor-content";
import { trendQueryProvider } from "@/lib/research/providers/trend-query";
import { useCaseProvider } from "@/lib/research/providers/use-cases";
import {
  buildResearchContext,
  keywordProvider,
  webSearchProvider,
} from "@/lib/research/providers/web-search";
import type { ResearchProvider } from "@/lib/research/types";

// C1 note: the old rss/sitemap providers emitted competitor headlines verbatim
// as topics — exactly what the angle rule forbids. competitorContentProvider
// replaces them: it indexes the same feeds but emits topic *gaps* with our
// angle, never their titles.
export const researchProviders: ResearchProvider[] = [
  useCaseProvider,
  competitorContentProvider,
  webSearchProvider,
  trendQueryProvider,
  keywordProvider,
];

export { buildResearchContext };
