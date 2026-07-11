import { and, count, eq, inArray } from "drizzle-orm";
import { getBrandProfile } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { articles, articlePublications, setupRuns } from "@/lib/db/schema";
import { auditFindings, audits } from "@/lib/db/schema/visibility";
import { listIntegrations } from "@/lib/integrations/repository";
import { isIntegrationOperational } from "@/lib/integrations/providers";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
};

/**
 * Owner checklist aligned with Claudia's product (Setup Run + standing work),
 * not the old manual content-agent wizard alone.
 */
export async function getOnboardingSteps(brandId: string): Promise<OnboardingStep[]> {
  const [brand, integrations, setup, auditCount, articleCount, publishedCount, installedFixCount] =
    await Promise.all([
      getBrandProfile(brandId),
      listIntegrations(brandId),
      getDb().select().from(setupRuns).where(eq(setupRuns.brandId, brandId)).limit(1),
      getDb()
        .select({ value: count() })
        .from(audits)
        .where(
          and(
            eq(audits.brandId, brandId),
            eq(audits.kind, "owned"),
            eq(audits.status, "complete"),
          ),
        ),
      getDb()
        .select({ value: count() })
        .from(articles)
        .where(eq(articles.brandId, brandId)),
      getDb()
        .select({ value: count() })
        .from(articlePublications)
        .where(eq(articlePublications.brandId, brandId)),
      getDb()
        .select({ value: count() })
        .from(auditFindings)
        .where(
          and(
            eq(auditFindings.brandId, brandId),
            inArray(auditFindings.resolution, ["user_applied", "auto_applied", "completed"]),
          ),
        ),
    ]);

  const hasWebsite = Boolean(brand?.website?.trim());
  const setupStatus = setup[0]?.status ?? null;
  const setupComplete = setupStatus === "completed";
  // Setup run completed, or an owned audit already landed (e.g. manual path).
  const hasAudit = (auditCount[0]?.value ?? 0) > 0 || setupComplete;
  const hasIntegration = integrations.some(isIntegrationOperational);
  const hasArticle = (articleCount[0]?.value ?? 0) > 0;
  const hasPublished = (publishedCount[0]?.value ?? 0) > 0;
  const hasInstalledFix = (installedFixCount[0]?.value ?? 0) > 0;
  const hasShippedWork = hasPublished || hasInstalledFix;

  return [
    {
      id: "website",
      title: "Add your website",
      description: "Claudia audits and monitors the site on your brand profile.",
      href: "/settings?tab=brand",
      completed: hasWebsite,
    },
    {
      id: "setup",
      title: "Let Claudia finish Setup",
      description: "First audit, answer check, topics, and Day-0 brief: runs after you hire her.",
      href: "/dashboard",
      completed: setupComplete || hasAudit,
    },
    {
      id: "integration",
      title: "Connect a publishing destination",
      description: "WordPress, Ghost, webhook, or another connector so drafts can go live.",
      href: "/settings?tab=integrations",
      completed: hasIntegration,
    },
    {
      id: "article",
      title: "Review your first article",
      description: "Claudia writes on cadence: open drafts in Articles when they land.",
      href: "/articles",
      completed: hasArticle,
    },
    {
      id: "publish",
      title: "Publish or install a fix",
      description: "Ship an article, or install a ready fix from the fix queue and mark it done.",
      href: hasPublished ? "/articles" : "/visibility/fixes",
      completed: hasShippedWork,
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]) {
  const completed = steps.filter((step) => step.completed).length;
  return { completed, total: steps.length };
}
