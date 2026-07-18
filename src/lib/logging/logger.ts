type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const DEFAULT_SERVICE = "seo-ai";
const MAX_STRING = 2_000;
const MAX_NESTED = 500;

const REDACT_KEY =
  /^(authorization|cookie|password|passwd|secret|token|api[_-]?key|encryption[_-]?key|database_url|private[_-]?key|bearer)$/i;

function serviceName(): string {
  return process.env.POSTHOG_SERVICE_NAME?.trim() || DEFAULT_SERVICE;
}

function deploymentEnvironment(): string {
  return (
    process.env.POSTHOG_ENVIRONMENT?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

function posthogHost(): string {
  const host = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  return host.replace(/\/$/, "");
}

function posthogToken(): string | undefined {
  const token = process.env.POSTHOG_PROJECT_TOKEN?.trim();
  return token || undefined;
}

/** Whether to also POST OTLP logs (local/dev). Production uses CF → PostHog export. */
function shouldShipDirect(): boolean {
  if (!posthogToken()) return false;
  if (process.env.POSTHOG_LOGS_DIRECT === "0") return false;
  // On Cloudflare Workers, prefer Observability destinations to avoid double-billing.
  if (process.env.POSTHOG_LOGS_DIRECT === "1") return true;
  return process.env.NEXT_RUNTIME === "nodejs" || !("WebSocketPair" in globalThis);
}

function severityNumber(level: LogLevel): number {
  if (level === "error") return 17;
  if (level === "warn") return 13;
  return 9;
}

function scalarize(value: unknown, depth = 0): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`.slice(0, MAX_STRING);
  }
  if (depth > 2) return String(value).slice(0, MAX_NESTED);
  try {
    return JSON.stringify(value).slice(0, MAX_NESTED);
  } catch {
    return String(value).slice(0, MAX_NESTED);
  }
}

/** Drop secrets and keep only scalar-friendly attributes for PostHog filters. */
export function sanitizeLogFields(fields: LogFields = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value instanceof Error) {
      out[`${key}_name`] = value.name;
      const message = scalarize(value.message);
      if (message !== undefined) out[`${key}_message`] = message;
      continue;
    }
    const next = scalarize(value);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

export function errorFields(error: unknown, key = "error"): LogFields {
  if (error instanceof Error) {
    return {
      [`${key}_name`]: error.name,
      [`${key}_message`]: error.message.slice(0, 500),
    };
  }
  return { [`${key}_message`]: String(error).slice(0, 500) };
}

type OtlpAnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

function toOtlpValue(value: string | number | boolean): OtlpAnyValue {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  return { stringValue: value };
}

async function shipOtlp(
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean>,
): Promise<void> {
  const token = posthogToken();
  if (!token) return;

  const attributes = Object.entries({ event, ...fields }).map(([key, value]) => ({
    key,
    value: toOtlpValue(value),
  }));

  const body = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName() } },
            {
              key: "deployment.environment",
              value: { stringValue: deploymentEnvironment() },
            },
          ],
        },
        scopeLogs: [
          {
            scope: { name: serviceName() },
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

  try {
    await fetch(`${posthogHost()}/i/v1/logs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Never let logging break the request path.
  }
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const sanitized = sanitizeLogFields(fields);
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    "service.name": serviceName(),
    "deployment.environment": deploymentEnvironment(),
    ...sanitized,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  if (shouldShipDirect()) {
    void shipOtlp(level, event, sanitized);
  }
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

/** Bind stable context (workspace, brand, run) onto every subsequent log line. */
export function createLogger(base: LogFields = {}) {
  const bound = sanitizeLogFields(base);
  return {
    info(event: string, fields?: LogFields) {
      logInfo(event, { ...bound, ...fields });
    },
    warn(event: string, fields?: LogFields) {
      logWarn(event, { ...bound, ...fields });
    },
    error(event: string, fields?: LogFields) {
      logError(event, { ...bound, ...fields });
    },
  };
}
