import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { getCreditBalance, listCreditLedger } from "@/lib/usage/credits";

/** Credit balance, per-action costs, and recent ledger history for the UI. */
export async function GET() {
  return handleApi(async () => {
    const { workspace } = await requireApiBrand();

    const [balance, ledger] = await Promise.all([
      getCreditBalance(workspace.id),
      listCreditLedger(workspace.id, 20),
    ]);

    return jsonOk({
      balance,
      costs: CREDIT_COSTS,
      ledger: ledger.map((entry) => ({
        id: entry.id,
        delta: entry.delta,
        balanceAfter: entry.balanceAfter,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
    });
  });
}
