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

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    "service.name": SERVICE,
    ...sanitize(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
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

export function createLogger(base: LogFields = {}) {
  const bound = sanitize(base);
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
