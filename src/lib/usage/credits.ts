import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { creditLedger, subscriptions } from "@/lib/db/schema";

export type CreditBalance = {
  monthly: number;
  purchased: number;
  total: number;
};

export type CreditBucket = "monthly" | "purchased";

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(`Insufficient credits (need ${required}, have ${available})`);
    this.name = "InsufficientCreditsError";
  }
}

type LedgerRef = {
  reason: string;
  brandId?: string | null;
  refType?: string | null;
  refId?: string | null;
};

export async function getCreditBalance(workspaceId: string): Promise<CreditBalance> {
  const [row] = await getDb()
    .select({
      monthly: subscriptions.monthlyCredits,
      purchased: subscriptions.purchasedCredits,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);

  const monthly = row?.monthly ?? 0;
  const purchased = row?.purchased ?? 0;
  return { monthly, purchased, total: monthly + purchased };
}

/** Fast pre-check before doing expensive work. Throws if the balance is short. */
export async function assertHasCredits(workspaceId: string, cost: number) {
  const balance = await getCreditBalance(workspaceId);
  if (balance.total < cost) {
    throw new InsufficientCreditsError(cost, balance.total);
  }
  return balance;
}

/**
 * Deduct `cost` credits atomically, draining the monthly (expiring) bucket
 * before the purchased (permanent) one. Re-checks the balance under a row lock
 * so concurrent spends can't overdraw. Call this only after the paid work has
 * succeeded — failed work must never burn credits.
 */
export async function spendCredits(workspaceId: string, cost: number, ref: LedgerRef) {
  return getDb().transaction(async (tx) => {
    const [sub] = await tx
      .select({
        id: subscriptions.id,
        monthly: subscriptions.monthlyCredits,
        purchased: subscriptions.purchasedCredits,
      })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .for("update")
      .limit(1);

    const monthly = sub?.monthly ?? 0;
    const purchased = sub?.purchased ?? 0;
    if (!sub || monthly + purchased < cost) {
      throw new InsufficientCreditsError(cost, monthly + purchased);
    }

    const fromMonthly = Math.min(monthly, cost);
    const fromPurchased = cost - fromMonthly;
    const newMonthly = monthly - fromMonthly;
    const newPurchased = purchased - fromPurchased;
    const balanceAfter = newMonthly + newPurchased;

    await tx
      .update(subscriptions)
      .set({
        monthlyCredits: newMonthly,
        purchasedCredits: newPurchased,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    await tx.insert(creditLedger).values({
      workspaceId,
      brandId: ref.brandId ?? null,
      delta: -cost,
      balanceAfter,
      reason: ref.reason,
      refType: ref.refType ?? null,
      refId: ref.refId ?? null,
    });

    return { monthly: newMonthly, purchased: newPurchased, total: balanceAfter };
  });
}

/**
 * Add credits to a bucket and record the movement. Idempotent when `refId` is
 * supplied (a repeat with the same reason+refId is a no-op) so Stripe webhook
 * retries can't double-credit.
 */
export async function grantCredits(
  workspaceId: string,
  amount: number,
  ref: LedgerRef & { bucket: CreditBucket },
) {
  return getDb().transaction(async (tx) => {
    // Lock the row first, then check for a duplicate. Concurrent retries of the
    // same webhook serialize on this lock, so the second one always sees the
    // first's ledger entry and no-ops — no double-grant.
    const [sub] = await tx
      .select({
        id: subscriptions.id,
        monthly: subscriptions.monthlyCredits,
        purchased: subscriptions.purchasedCredits,
      })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .for("update")
      .limit(1);

    if (!sub) {
      return { monthly: 0, purchased: 0, total: 0 };
    }

    if (ref.refId) {
      const [dupe] = await tx
        .select({ id: creditLedger.id })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.workspaceId, workspaceId),
            eq(creditLedger.reason, ref.reason),
            eq(creditLedger.refId, ref.refId),
          ),
        )
        .limit(1);
      if (dupe) {
        return { monthly: sub.monthly, purchased: sub.purchased, total: sub.monthly + sub.purchased };
      }
    }

    const newMonthly = sub.monthly + (ref.bucket === "monthly" ? amount : 0);
    const newPurchased = sub.purchased + (ref.bucket === "purchased" ? amount : 0);
    const balanceAfter = newMonthly + newPurchased;

    await tx
      .update(subscriptions)
      .set({
        monthlyCredits: newMonthly,
        purchasedCredits: newPurchased,
        // A top-up ends any low-credit episode; clear the throttle so the next
        // time the agent runs dry the owner gets notified again.
        lastLowCreditEmailAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    await tx.insert(creditLedger).values({
      workspaceId,
      brandId: ref.brandId ?? null,
      delta: amount,
      balanceAfter,
      reason: ref.reason,
      refType: ref.refType ?? null,
      refId: ref.refId ?? null,
    });

    return { monthly: newMonthly, purchased: newPurchased, total: balanceAfter };
  });
}

/**
 * Reset the monthly bucket to `grant` at a billing cycle. Expires any leftover
 * monthly credits (purchased credits are untouched) and refreshes the grant.
 * Idempotent per `refId` (the Stripe invoice id) so renewal webhook retries
 * don't grant twice.
 */
export async function resetMonthlyCredits(
  workspaceId: string,
  grant: number,
  ref: { refId: string; refType?: string },
) {
  return getDb().transaction(async (tx) => {
    // Lock first, then dedupe (see grantCredits) so concurrent renewal webhooks
    // can't both pass the check and grant twice.
    const [sub] = await tx
      .select({
        id: subscriptions.id,
        monthly: subscriptions.monthlyCredits,
        purchased: subscriptions.purchasedCredits,
      })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .for("update")
      .limit(1);

    if (!sub) {
      return { monthly: 0, purchased: 0, total: 0 };
    }

    const [dupe] = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, workspaceId),
          eq(creditLedger.reason, "monthly_grant"),
          eq(creditLedger.refId, ref.refId),
        ),
      )
      .limit(1);
    if (dupe) {
      return { monthly: sub.monthly, purchased: sub.purchased, total: sub.monthly + sub.purchased };
    }

    const refType = ref.refType ?? "stripe_invoice";

    // Expire whatever monthly balance is left before granting the new cycle, so
    // the ledger reads as a true running balance.
    if (sub.monthly > 0) {
      await tx.insert(creditLedger).values({
        workspaceId,
        delta: -sub.monthly,
        balanceAfter: sub.purchased,
        reason: "monthly_expire",
        refType,
        refId: ref.refId,
      });
    }

    await tx
      .update(subscriptions)
      .set({
        monthlyCredits: grant,
        monthlyCreditGrant: grant,
        creditsRefreshedAt: new Date(),
        // Fresh billing cycle ends any low-credit episode; re-arm the notification.
        lastLowCreditEmailAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    await tx.insert(creditLedger).values({
      workspaceId,
      delta: grant,
      balanceAfter: sub.purchased + grant,
      reason: "monthly_grant",
      refType,
      refId: ref.refId,
    });

    return { monthly: grant, purchased: sub.purchased, total: sub.purchased + grant };
  });
}

/** Recent ledger entries for the credits history UI. */
export async function listCreditLedger(workspaceId: string, limit = 20) {
  return getDb()
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}

/**
 * Credits spent by a brand, keyed by the `refId` each spend paid for (a research
 * run id or an article id). Looks up only the refs the activity feed is showing,
 * so attribution stays accurate no matter how old the row is.
 */
export async function creditsForRefs(brandId: string, refIds: string[]) {
  const map = new Map<string, number>();
  if (refIds.length === 0) return map;
  const rows = await getDb()
    .select({ refId: creditLedger.refId, delta: creditLedger.delta })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.brandId, brandId),
        lt(creditLedger.delta, 0),
        inArray(creditLedger.refId, refIds),
      ),
    );
  for (const row of rows) {
    if (row.refId) map.set(row.refId, (map.get(row.refId) ?? 0) + Math.abs(row.delta));
  }
  return map;
}

/**
 * Recent competitor discoveries for the activity feed. They leave no job/run
 * record, so their ledger spends are the only trace.
 */
export async function listCompetitorDiscoveries(brandId: string, limit = 10) {
  return getDb()
    .select({ id: creditLedger.id, delta: creditLedger.delta, createdAt: creditLedger.createdAt })
    .from(creditLedger)
    .where(and(eq(creditLedger.brandId, brandId), eq(creditLedger.reason, "competitor_discovery")))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}
