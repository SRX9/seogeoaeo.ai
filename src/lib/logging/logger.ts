type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
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
