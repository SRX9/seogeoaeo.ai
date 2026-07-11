import { assertNoSetupRunning, handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";
import { discoverCompetitors } from "@/lib/brand/enrich";
import { getBrandProfile, listCompetitors } from "@/lib/brand/repository";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { recentAnswerExcerpts } from "@/lib/visibility/answers";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * AI competitor discovery for the active brand. Costs credits and is
 * rate-limited. Returns suggestions (deduped against existing competitors and
 * the brand's own domain); the client shows a checklist and inserts the picked
 * ones via /bulk.
 */
export async function POST() {
  return handleApi(async () => {
    const { workspace, brand } = await requireApiBrand();
    await assertNoSetupRunning(brand.id);
    const cost = CREDIT_COSTS.competitor_discovery;

    try {
      await assertHasCredits(workspace.id, cost);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, "Not enough credits for competitor discovery", {
          code: "INSUFFICIENT_CREDITS",
        });
      }
      throw error;
    }

    try {
      await assertWorkspaceRateLimit(workspace.id, "discover_competitors", 5, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Several competitor searches have already run. Wait a moment and try again.", {
          code: "RATE_LIMITED",
        });
      }
      throw error;
    }

    const [profile, existing, answerExcerpts] = await Promise.all([
      getBrandProfile(brand!.id),
      listCompetitors(brand!.id),
      recentAnswerExcerpts(brand!.id),
    ]);

    const remaining = MAX_COMPETITORS - existing.length;
    if (remaining <= 0) {
      return jsonOk({ suggestions: [] });
    }

    const existingHosts = new Set(
      existing.map((c) => safeHost(c.url)).filter((h): h is string => Boolean(h)),
    );

    const found = await discoverCompetitors(
      {
        name: brand!.name,
        website: profile?.website,
        productDescription: profile?.productDescription,
        seedKeywords: profile?.seedKeywords,
        answerExcerpts,
      },
      remaining,
    );

    const suggestions = found.filter((s) => {
      const host = safeHost(s.url);
      return host ? !existingHosts.has(host) : true;
    });

    // Charge only after a successful discovery call (the part with real cost).
    // Per-run refId so retries/double-clicks don't free-ride after the first spend
    // (ledger is idempotent on workspace+reason+refId: never key on brand id alone).
    await spendCredits(workspace.id, cost, {
      reason: "competitor_discovery",
      brandId: brand!.id,
      refType: "discovery",
      refId: crypto.randomUUID(),
    });

    return jsonOk({ suggestions });
  });
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
