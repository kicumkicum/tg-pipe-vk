import crypto from "node:crypto";

type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...fields
  };
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export type RequestLogger = {
  rid: string;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
};

/** Короткий id запроса — склеивает все логи одного webhook-вызова. */
export function createRequestLogger(component: string): RequestLogger {
  const rid = crypto.randomBytes(8).toString("hex");
  const base = { component, rid };
  return {
    rid,
    info: (event, fields = {}) => log("info", event, { ...base, ...fields }),
    warn: (event, fields = {}) => log("warn", event, { ...base, ...fields }),
    error: (event, fields = {}) => log("error", event, { ...base, ...fields })
  };
}

