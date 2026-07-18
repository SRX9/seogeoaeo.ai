/**
 * Shared contract for Workflows that call back into the app's /api/agent/*
 * step routes: Service Binding first, with a scoped signed public fallback.
 */

/** Bindings/vars every callback Workflow needs: it talks to the app over HTTP, no DB. */
import { NonRetryableError } from "cloudflare:workflows";
import { createCallbackToken } from "./callback-token";

export type AppEnv = Omit<AgentEnv, "APP"> & {
  /** HMAC key for short-lived callback tokens. */
  CRON_SECRET: string;
  /** Optional during the public-fallback migration; generated from the service binding. */
  APP?: AgentEnv["APP"];
};

// Per-step retry/backoff. Steps are HTTP calls into the app; transient failures
// (network, brief 5xx) retry, exhaustion is handled by each Workflow's own
// failure semantics.
export const RETRIES = { limit: 3, delay: "30 seconds", backoff: "exponential" } as const;

/** POST a step body to an /api/agent/* route; non-2xx throws (→ step retry). */
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429]);

export function appCaller<T>(env: AppEnv, path: string, workflowInstanceId: string) {
  return async (body: Record<string, unknown>): Promise<T> => {
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const brandId = typeof body.brandId === "string" ? body.brandId : null;
    const step = typeof body.step === "string" ? body.step : path.split("/").at(-1) ?? "callback";
    const requestId = crypto.randomUUID();
    const token = await createCallbackToken(env.CRON_SECRET, {
      workflowInstanceId,
      workspaceId,
      brandId,
      step,
      requestId,
    });
    const request = new Request(new URL(path, env.APP ? "https://seo-ai.internal" : env.APP_ORIGIN), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Callback-Token": token,
        "X-Agent-Request-Id": requestId,
        // Allows the workflow Worker to be deployed before the app during the
        // migration. Hardened callback routes ignore this legacy credential.
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
      body: JSON.stringify(body),
    });
    const res = env.APP ? await env.APP.fetch(request) : await fetch(request);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const message = `${path} ${String(body.step)} -> ${res.status} ${text.slice(0, 300)}`;
      if (res.status >= 400 && res.status < 500 && !RETRYABLE_HTTP_STATUSES.has(res.status)) {
        throw new NonRetryableError(message, "PermanentCallbackError");
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  };
}
