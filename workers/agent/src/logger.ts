type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const SERVICE = "agent-workflow";

const REDACT_KEY =
  /^(authorization|cookie|password|passwd|secret|token|api[_-]?key|encryption[_-]?key|database_url|private[_-]?key|bearer)$/i;

function scalarize(value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`.slice(0, 2_000);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function sanitize(fields: LogFields = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value instanceof Error) {
      out[`${key}_name`] = value.name;
      out[`${key}_message`] = value.message.slice(0, 500);
      continue;
    }
    const next = scalarize(value);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/** The env vars the logger needs to also ship logs to PostHog directly. */
export type LogShippingEnv = {
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
  POSTHOG_ENVIRONMENT?: string;
};

function severityNumber(level: LogLevel): number {
  if (level === "error") return 17;
  if (level === "warn") return 13;
  return 9;
}

/**
 * POST one OTLP log record straight to PostHog (mirrors the app's shipOtlp).
 * Workflow Workers have no request path of their own, so relying solely on the
 * account-level Cloudflare→PostHog log destination left workflow failures
 * invisible whenever that export was missing or misconfigured. Fire-and-forget:
 * logging must never fail or slow a workflow step.
 */
function shipOtlp(
  env: LogShippingEnv,
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean>,
) {
  const token = env.POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return;
  const host = (env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com").replace(/\/$/, "");
  const attributes = Object.entries({ event, ...fields }).map(([key, value]) => ({
    key,
    value:
      typeof value === "boolean"
        ? { boolValue: value }
        : typeof value === "number"
          ? Number.isInteger(value)
            ? { intValue: String(value) }
            : { doubleValue: value }
          : { stringValue: value },
  }));
  const body = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: SERVICE } },
            {
              key: "deployment.environment",
              value: { stringValue: env.POSTHOG_ENVIRONMENT?.trim() || "production" },
            },
          ],
        },
        scopeLogs: [
          {
            scope: { name: SERVICE },
            logRecords: [
              {
                timeUnixNano: String(Date.now() * 1_000_000),
                severityNumber: severityNumber(level),
                severityText: level,
                body: { stringValue: event },
                attributes,
              },
            ],
          },
        ],
      },
    ],
  };
  void fetch(`${host}/i/v1/logs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    // Never let logging break or slow a workflow.
  });
}

function write(level: LogLevel, event: string, fields: LogFields = {}, env?: LogShippingEnv) {
  const sanitized = sanitize(fields);
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    "service.name": SERVICE,
    ...sanitized,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  if (env) shipOtlp(env, level, event, sanitized);
}

export function logInfo(event: string, fields?: LogFields) {
  write("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  write("warn", event, fields);
}

export function logError(event: string, fields?: LogFields) {
  write("error", event, fields);
}

export function createLogger(base: LogFields = {}, env?: LogShippingEnv) {
  const bound = sanitize(base);
  return {
    info(event: string, fields?: LogFields) {
      write("info", event, { ...bound, ...fields }, env);
    },
    warn(event: string, fields?: LogFields) {
      write("warn", event, { ...bound, ...fields }, env);
    },
    error(event: string, fields?: LogFields) {
      write("error", event, { ...bound, ...fields }, env);
    },
  };
}
