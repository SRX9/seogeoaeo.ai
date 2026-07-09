import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getOpenFindings, setFindingResolved } from "@/lib/visibility/findings-repository";
import type { FixCapability, Pillar, Severity } from "@/lib/visibility/types";

/** V8.2 — open findings for the fix queue + dismiss/complete. */
export async function GET(request: Request) {
  return handleApi(async () => {
    const { workspace, brand } = await getApiContext();
    const p = new URL(request.url).searchParams;
    const findings = await getOpenFindings(workspace.id, {
      pillar: (p.get("pillar") as Pillar) ?? undefined,
      severity: (p.get("severity") as Severity) ?? undefined,
      capability: (p.get("capability") as FixCapability) ?? undefined,
      // Multi-brand: only show findings for the active brand when known.
      brandId: brand?.id,
    });
    return jsonOk({ findings });
  });
}

const patchSchema = z.object({
  findingId: z.string().uuid(),
  action: z.enum(["dismiss", "complete", "reopen"]),
});

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { findingId, action } = parseBody(patchSchema, await readJson(request));
    await setFindingResolved(
      findingId,
      workspace.id,
      action !== "reopen",
      action === "dismiss" ? "dismissed" : "completed",
    );
    return jsonOk({ findingId, resolved: action !== "reopen" });
  });
}
