import { getApiContext, handleApi, jsonOk } from "@/lib/api/server";
import { getLlmConfig } from "@/lib/llm/client";

/** Current session: user, workspace, subscription, brands, and active brand. */
export async function GET() {
  return handleApi(async () => {
    const ctx = await getApiContext();
    return jsonOk({
      user: ctx.session.user,
      llmReady: Boolean(getLlmConfig()),
      workspace: {
        id: ctx.workspace.id,
        name: ctx.workspace.name,
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
            currentPeriodEnd: ctx.subscription.currentPeriodEnd,
            hasStripeCustomer: Boolean(ctx.subscription.stripeCustomerId),
            creditEmailsEnabled: ctx.subscription.creditEmailsEnabled,
          }
        : null,
      brands: ctx.brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        autonomyMode: brand.autonomyMode,
        badgePublic: brand.badgePublic ?? false,
      })),
      activeBrandId: ctx.brand?.id ?? null,
    });
  });
}
