import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentMemory } from "@/lib/db/schema";

export type AgentMemoryInput = {
  kind: "fact" | "preference" | "constraint" | "permission" | "correction";
  key: string;
  value: Record<string, unknown>;
  confidence?: number;
  provenance: string;
  scope?: string;
  expiresAt?: Date | null;
};

export async function rememberAgentInstruction(scope: BrandScope, input: AgentMemoryInput) {
  const [row] = await getDb()
    .insert(agentMemory)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      kind: input.kind,
      key: input.key,
      value: input.value,
      confidence: Math.max(0, Math.min(100, input.confidence ?? 100)),
      provenance: input.provenance,
      scope: input.scope ?? "brand",
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: [agentMemory.brandId, agentMemory.kind, agentMemory.key, agentMemory.scope],
      set: {
        value: input.value,
        confidence: Math.max(0, Math.min(100, input.confidence ?? 100)),
        provenance: input.provenance,
        status: "active",
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error("Agent memory could not be saved");
  return row;
}

export async function listActiveAgentMemory(brandId: string, now = new Date()) {
  return getDb()
    .select()
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.brandId, brandId),
        eq(agentMemory.status, "active"),
        or(isNull(agentMemory.expiresAt), gt(agentMemory.expiresAt, now)),
      ),
    );
}

export async function listOwnerConstraints(brandId: string): Promise<string[]> {
  const rows = await listActiveAgentMemory(brandId);
  return rows.flatMap((row) => {
    if (row.kind !== "constraint") return [];
    const instruction = row.value.instruction;
    return typeof instruction === "string" ? [instruction] : [];
  });
}
