import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { logWarn } from "@/lib/logging/logger";
import { getWorkspaceOwnerEmail } from "@/lib/workspace";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { outOfCreditsEmail, type EmailContent } from "@/lib/email/templates";

/**
 * Send a rendered email to the workspace owner. Best-effort: returns false and
 * logs instead of throwing, so cron flows never fail on delivery.
 */
export async function sendToWorkspaceOwner(workspaceId: string, content: EmailContent): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;
    const email = await getWorkspaceOwnerEmail(workspaceId);
    if (!email) return false;
    return await sendEmail({ to: email, subject: content.subject, html: content.html, text: content.text });
  } catch (error) {
    logWarn("email.owner_send_skipped", {
      workspaceId,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

/** Don't re-nag about low credits more than once per week. */
const LOW_CREDIT_EMAIL_THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

export type OutOfCreditsNotice = {
  workspaceId: string;
  brandName?: string;
  pendingTopics: number;
};

/**
 * Email the workspace owner that the agent paused for lack of credits. Throttled
 * via `subscriptions.lastLowCreditEmailAt` (which credit top-ups clear, so a new
 * low-credit episode re-notifies). Best-effort: any failure is swallowed so it
 * can never break the daily pipeline.
 */
export async function sendOutOfCreditsEmail(notice: OutOfCreditsNotice): Promise<void> {
  try {
    if (!isEmailConfigured()) return;

    const [sub] = await getDb()
      .select({
        lastLowCreditEmailAt: subscriptions.lastLowCreditEmailAt,
        creditEmailsEnabled: subscriptions.creditEmailsEnabled,
      })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, notice.workspaceId))
      .limit(1);

    // Owner opted out of credit emails: skip without touching the throttle.
    if (sub && !sub.creditEmailsEnabled) return;

    const last = sub?.lastLowCreditEmailAt;
    if (last && Date.now() - new Date(last).getTime() < LOW_CREDIT_EMAIL_THROTTLE_MS) {
      return;
    }

    const email = await getWorkspaceOwnerEmail(notice.workspaceId);
    if (!email) return;

    const origin = getServerEnv().BETTER_AUTH_URL ?? "https://seogeoaeo.ai";
    const { subject, html, text } = outOfCreditsEmail({
      brandName: notice.brandName ?? "your brand",
      pendingTopics: notice.pendingTopics,
      dashboardUrl: `${origin}/dashboard`,
      creditsUrl: `${origin}/pricing`,
    });

    const sent = await sendEmail({ to: email, subject, html, text });
    if (sent) {
      await getDb()
        .update(subscriptions)
        .set({ lastLowCreditEmailAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.workspaceId, notice.workspaceId));
    }
  } catch (error) {
    logWarn("email.out_of_credits_skipped", {
      workspaceId: notice.workspaceId,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
