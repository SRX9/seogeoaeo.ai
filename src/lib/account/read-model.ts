import type { getActiveBrandContext } from "@/lib/brand/context";
import { listBrandIdentitySummaries } from "@/lib/brand/intelligence";
import { getLlmConfig } from "@/lib/llm/client";
import type { MeResponse } from "@/lib/api/queries";

type AccountContext = Awaited<ReturnType<typeof getActiveBrandContext>>;

/** Shared serializable workspace bootstrap for the RSC shell and `/api/me`. */
export async function getMeData(ctx: AccountContext): Promise<MeResponse> {
  const identities = await listBrandIdentitySummaries(ctx.workspace.id);

  return {
    user: ctx.session.user,
    llmReady: Boolean(getLlmConfig()),
    workspace: {
      id: ctx.workspace.id,
      name: ctx.workspace.name,
      emailPreferences: {
        milestoneEmailsEnabled: ctx.workspace.milestoneEmailsEnabled ?? true,
        reviewEmailsEnabled: ctx.workspace.reviewEmailsEnabled ?? true,
        dailySummaryEmailsEnabled: ctx.workspace.dailySummaryEmailsEnabled ?? true,
      },
    },
    subscription: ctx.subscription
      ? {
          planId: ctx.subscription.planId,
          status: ctx.subscription.status,
          credits: {
            monthly: ctx.subscription.monthlyCredits,
            purchased: ctx.subscription.purchasedCredits,
            total: ctx.subscription.monthlyCredits + ctx.subscription.purchasedCredits,
          },
          monthlyCreditGrant: ctx.subscription.monthlyCreditGrant,
          currentPeriodEnd: ctx.subscription.currentPeriodEnd?.toISOString() ?? null,
          hasStripeCustomer: Boolean(ctx.subscription.stripeCustomerId),
          creditEmailsEnabled: ctx.subscription.creditEmailsEnabled,
        }
      : null,
    brands: ctx.brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      autonomyMode: brand.autonomyMode,
      badgePublic: brand.badgePublic ?? false,
      identity: identities.get(brand.id) ?? null,
    })),
    activeBrandId: ctx.brand?.id ?? null,
  };
}
