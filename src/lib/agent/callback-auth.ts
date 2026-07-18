import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getBrand } from "@/lib/brand/repository";
import { plans, FREE_PLAN_ID } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import {
  agentCallbackReceipts,
  subscriptions,
} from "@/lib/db/schema";
import { logError, logWarn } from "@/lib/logging/logger";
import { recordOperationalSignalBestEffort } from "@/lib/observability/trace";

const callbackClaimsSchema = z.object({
  v: z.literal(1),
  sub: z.literal("agent-workflow"),
  workflowInstanceId: z.string().min(1).max(160),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid().nullable(),
  step: z.string().min(1).max(80),
  nonce: z.string().uuid(),
  requestId: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
}).strict();

type CallbackClaims = z.infer<typeof callbackClaimsSchema>;

export class AgentCallbackError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgentCallbackError";
  }
}

export function parseAgentCallbackBody<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AgentCallbackError(400, parsed.error.issues[0]?.message ?? "Invalid callback body");
  }
  return parsed.data;
}

export async function readAgentCallbackJson(request: Request): Promise<unknown> {
  const maxBytes = 64 * 1024;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AgentCallbackError(413, "Agent callback body is too large");
  }
  try {
    if (!request.body) return {};
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("callback body limit exceeded");
        throw new AgentCallbackError(413, "Agent callback body is too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof AgentCallbackError) throw error;
    throw new AgentCallbackError(400, "Invalid JSON callback body");
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyToken(token: string, secret: string): Promise<CallbackClaims> {
  const [encoded, signatureText, extra] = token.split(".");
  if (!encoded || !signatureText || extra) {
    throw new AgentCallbackError(401, "Malformed agent callback token");
  }
  let signature: Uint8Array;
  let payload: unknown;
  try {
    signature = decodeBase64Url(signatureText);
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
  } catch {
    throw new AgentCallbackError(401, "Malformed agent callback token");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signature).buffer,
    new TextEncoder().encode(encoded),
  );
  if (!valid) throw new AgentCallbackError(401, "Invalid agent callback signature");
  const parsed = callbackClaimsSchema.safeParse(payload);
  if (!parsed.success) throw new AgentCallbackError(401, "Invalid agent callback claims");
  return parsed.data;
}

const KNOWN_SUBSCRIPTION_STATUSES = new Set([
  "inactive",
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export async function authorizeAgentCallback(
  request: Request,
  expected: {
    workspaceId: string;
    brandId?: string | null;
    step: string;
    planId?: string | null;
  },
) {
  const secret = process.env.CRON_SECRET;
  const token = request.headers.get("x-agent-callback-token");
  if (!secret || !token) throw new AgentCallbackError(401, "Unauthorized");
  const claims = await verifyToken(token, secret);
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (
    claims.iat > nowSeconds + 30 ||
    claims.exp <= nowSeconds ||
    claims.exp - claims.iat > 300
  ) {
    throw new AgentCallbackError(401, "Expired agent callback token");
  }
  const requestId = request.headers.get("x-agent-request-id");
  if (
    claims.workspaceId !== expected.workspaceId ||
    claims.brandId !== (expected.brandId ?? null) ||
    claims.step !== expected.step ||
    requestId !== claims.requestId
  ) {
    throw new AgentCallbackError(403, "Agent callback scope mismatch");
  }

  const db = getDb();
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, expected.workspaceId))
    .limit(1);
  if (!subscription) throw new AgentCallbackError(403, "Workspace subscription not found");
  if (
    (subscription.planId !== FREE_PLAN_ID && !(subscription.planId in plans)) ||
    !KNOWN_SUBSCRIPTION_STATUSES.has(subscription.status)
  ) {
    throw new AgentCallbackError(403, "Invalid subscription plan context");
  }
  if (expected.planId != null && expected.planId !== subscription.planId) {
    throw new AgentCallbackError(403, "Callback plan does not match workspace subscription");
  }

  const brand = expected.brandId
    ? await getBrand(expected.workspaceId, expected.brandId)
    : null;
  if (expected.brandId && !brand) {
    throw new AgentCallbackError(403, "Brand does not belong to callback workspace");
  }

  const windowStart = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ value: count() })
    .from(agentCallbackReceipts)
    .where(
      and(
        eq(agentCallbackReceipts.workflowInstanceId, claims.workflowInstanceId),
        eq(agentCallbackReceipts.stepName, claims.step),
        gt(agentCallbackReceipts.createdAt, windowStart),
      ),
    );
  if ((recent?.value ?? 0) >= 120) {
    throw new AgentCallbackError(429, "Agent callback rate limit exceeded");
  }

  const [receipt] = await db
    .insert(agentCallbackReceipts)
    .values({
      nonce: claims.nonce,
      workflowInstanceId: claims.workflowInstanceId,
      workspaceId: claims.workspaceId,
      brandId: claims.brandId,
      stepName: claims.step,
      tokenSubject: claims.sub,
      requestId: claims.requestId,
      expiresAt: new Date(claims.exp * 1_000),
    })
    .onConflictDoNothing()
    .returning({ nonce: agentCallbackReceipts.nonce });
  if (!receipt) throw new AgentCallbackError(409, "Agent callback replay detected");

  return { claims, subscription, brand };
}

export async function agentCallbackErrorResponse(error: unknown): Promise<Response> {
  if (error instanceof AgentCallbackError) {
    logWarn("security.callback_auth_denied", {
      status: error.status,
      reason: error.message,
    });
    await recordOperationalSignalBestEffort("callback_auth_failure", {
      status: error.status,
      reason: error.message,
    });
    return Response.json({ error: error.message }, { status: error.status });
  }
  logError("agent.callback_unhandled", {
    error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
  });
  return Response.json({ error: "Agent callback failed" }, { status: 500 });
}
