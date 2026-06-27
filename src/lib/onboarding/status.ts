import { count, eq } from "drizzle-orm";
import { getBrandProfile } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { articles, articlePublications, researchRuns } from "@/lib/db/schema";
import { listIntegrations } from "@/lib/integrations/repository";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
};

export async function getOnboardingSteps(brandId: string): Promise<OnboardingStep[]> {
  const [brand, integrations, researchCount, articleCount, publishedCount] = await Promise.all([
    getBrandProfile(brandId),
    listIntegrations(brandId),
    getDb()
      .select({ value: count() })
      .from(researchRuns)
      .where(eq(researchRuns.brandId, brandId)),
    getDb()
      .select({ value: count() })
      .from(articles)
      .where(eq(articles.brandId, brandId)),
    getDb()
      .select({ value: count() })
      .from(articlePublications)
      .where(eq(articlePublications.brandId, brandId)),
  ]);

  const hasBrand = Boolean(brand?.productDescription?.trim());
  const hasIntegration = integrations.some((integration) => integration.enabled);
  const hasResearch = (researchCount[0]?.value ?? 0) > 0;
  const hasArticle = (articleCount[0]?.value ?? 0) > 0;
  const hasPublished = (publishedCount[0]?.value ?? 0) > 0;

  return [
    {
      id: "brand",
      title: "Set up your brand profile",
      description: "Tell the agent about your product, audience, and keywords.",
      href: "/settings?tab=brand",
      completed: hasBrand,
    },
    {
      id: "integration",
      title: "Connect a publishing destination",
      description: "Enable Dev.to, a webhook, or another connector.",
      href: "/settings?tab=integrations",
      completed: hasIntegration,
    },
    {
      id: "research",
      title: "Run your first research pass",
      description: "Discover ranked topics worth writing about.",
      href: "/topics",
      completed: hasResearch,
    },
    {
      id: "article",
      title: "Generate your first article",
      description: "Turn a topic into a draft article.",
      href: "/topics",
      completed: hasArticle,
    },
    {
      id: "publish",
      title: "Approve and publish",
      description: "Approve an article and send it to your connected platforms.",
      href: "/articles",
      completed: hasPublished,
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]) {
  const completed = steps.filter((step) => step.completed).length;
  return { completed, total: steps.length };
}
