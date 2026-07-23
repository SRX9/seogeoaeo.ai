import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ownerEmailDeliveries, subscriptions, user, workspaces } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { logWarn } from "@/lib/logging/logger";
import { getWorkspaceOwnerEmail } from "@/lib/workspace";
import type { ClaudiaEmailPreferences } from "@/lib/workspace";
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

export type ClaudiaEmailPreference = keyof ClaudiaEmailPreferences;

/**
 * Send only when the owner has left this communication enabled. Preference
 * reads are row-locked through delivery so a completed opt-out cannot race a
 * send. An idempotency key additionally serializes and records one delivery.
 */
export async function sendToWorkspaceOwnerWhenEnabled(
  workspaceId: string,
  preference: ClaudiaEmailPreference,
  content: EmailContent,
  options: { idempotencyKey?: string } = {},
): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;

    return await getDb().transaction(async (tx) => {
      if (options.idempotencyKey) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`owner-email:${workspaceId}:${options.idempotencyKey}`}))`,
        );
        const [delivered] = await tx
          .select({ id: ownerEmailDeliveries.id })
          .from(ownerEmailDeliveries)
          .where(
            and(
              eq(ownerEmailDeliveries.workspaceId, workspaceId),
              eq(ownerEmailDeliveries.idempotencyKey, options.idempotencyKey),
            ),
          )
          .limit(1);
        if (delivered) return false;
      }

      const [owner] = await tx
        .select({
          email: user.email,
          milestoneEmailsEnabled: workspaces.milestoneEmailsEnabled,
          reviewEmailsEnabled: workspaces.reviewEmailsEnabled,
          dailySummaryEmailsEnabled: workspaces.dailySummaryEmailsEnabled,
        })
        .from(workspaces)
        .innerJoin(user, eq(user.id, workspaces.ownerId))
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
        .for("update", { of: workspaces });
      if (!owner?.email || !owner[preference]) return false;

      const sent = await sendEmail({
        to: owner.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (!sent) return false;

      if (options.idempotencyKey) {
        await tx.insert(ownerEmailDeliveries).values({
          workspaceId,
          idempotencyKey: options.idempotencyKey,
        });
      }
      return true;
    });
  } catch (error) {
    logWarn("email.owner_send_skipped", {
      workspaceId,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

/**
 * Alert the operator (developer) about a failure the customer cannot fix
 * themselves. Best-effort and plain-text-first: this is an ops pager, not a
 * customer email. Requires OPERATOR_ALERT_EMAIL to be configured.
 */
export async function sendOperatorAlert(subject: string, lines: string[]): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;
    const to = getServerEnv().OPERATOR_ALERT_EMAIL;
    if (!to) return false;
    const text = lines.join("\n");
    const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`;
    return await sendEmail({ to, subject: `[seogeoaeo ops] ${subject}`, html, text });
  } catch (error) {
    logWarn("email.operator_alert_skipped", {
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
