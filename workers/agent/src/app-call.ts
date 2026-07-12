/**
 * Shared contract for Workflows that call back into the app's /api/agent/*
 * step routes: bearer auth with CRON_SECRET, JSON body, truncated error text.
 * One home so the auth header and retry policy can't drift between Workflows.
 */

/** Bindings/vars every callback Workflow needs: it talks to the app over HTTP, no DB. */
export type AppEnv = {
  /** Shared bearer token the app's /api/agent/* routes check. */
  CRON_SECRET: string;
  /** Origin of the Next.js app, e.g. https://seogeoaeo.ai. */
  APP_ORIGIN: string;
};

// Per-step retry/backoff. Steps are HTTP calls into the app; transient failures
// (network, brief 5xx) retry, exhaustion is handled by each Workflow's own
// failure semantics.
export const RETRIES = { limit: 3, delay: "30 seconds", backoff: "exponential" } as const;

/** POST a step body to an /api/agent/* route; non-2xx throws (→ step retry). */
export function appCaller<T>(env: AppEnv, path: string) {
  return async (body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(new URL(path, env.APP_ORIGIN), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${path} ${String(body.step)} → ${res.status} ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  };
}
