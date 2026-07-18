import { z } from "zod";
import {
  listActiveOwnerPolicies,
  revokeOwnerPolicy,
  simulateOwnerPolicies,
} from "@/lib/agent/policies";
import { policyCapabilitySchema } from "@/lib/agent/policy-model";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";

export async function GET() {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const policies = await listActiveOwnerPolicies(scope.brandId);
    return jsonOk({
      policies: policies.map((policy) => ({
        id: policy.id,
        effect: policy.effect,
        capabilities: policy.capabilities,
        resources: policy.resources,
        conditions: policy.conditions,
        expiresAt: policy.expiresAt,
        originalText: policy.originalText,
        parserVersion: policy.parserVersion,
        policyVersion: policy.policyVersion,
        confirmedAt: policy.confirmedAt?.toISOString() ?? null,
      })),
    });
  });
}

const simulationSchema = z.object({
  capability: policyCapabilitySchema,
  resourceRef: z.string().trim().min(1).max(500),
  destination: z.string().trim().min(1).max(100).nullable().optional(),
  categories: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
}).strict();

export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const body = parseBody(simulationSchema, await readJson(request));
    const policies = await listActiveOwnerPolicies(scope.brandId);
    return jsonOk(simulateOwnerPolicies(policies, body));
  });
}

const revokeSchema = z.object({ policyId: z.string().uuid() }).strict();

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const body = parseBody(revokeSchema, await readJson(request));
    if (!(await revokeOwnerPolicy(scope, body.policyId))) {
      throw new HttpError(404, "Active policy not found");
    }
    return jsonOk({ id: body.policyId, status: "revoked" });
  });
}

