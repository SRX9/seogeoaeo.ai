import { desc, eq } from "drizzle-orm";
import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { agentActionLedger } from "@/lib/db/schema";

export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const actions = await getDb()
      .select()
      .from(agentActionLedger)
      .where(eq(agentActionLedger.brandId, brand.id))
      .orderBy(desc(agentActionLedger.createdAt))
      .limit(25);
    return jsonOk({
      actions: actions.map((action) => ({
        id: action.id,
        actionType: action.actionType,
        resourceRef: action.resourceRef,
        capability: action.capability,
        beforeState: action.beforeState,
        appliedChange: action.appliedChange,
        remoteRef: action.remoteRef,
        rollbackSupported: action.rollbackHandle != null,
        status: action.status,
        verificationStatus: action.verificationStatus,
        verificationResult: action.verificationResult,
        createdAt: action.createdAt.toISOString(),
        verifiedAt: action.verifiedAt?.toISOString() ?? null,
      })),
    });
  });
}
