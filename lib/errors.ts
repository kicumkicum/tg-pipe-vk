export class HttpError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export class ApiError extends Error {
  public readonly code?: number;
  public readonly retryable: boolean;

  constructor(message: string, opts?: { code?: number; retryable?: boolean }) {
    super(message);
    this.name = "ApiError";
    this.code = opts?.code;
    this.retryable = opts?.retryable ?? false;
  }
}

/** Не хватает обязательных переменных окружения (конфиг деплоя). */
export class ConfigError extends Error {
  public readonly missing: readonly string[];

  constructor(missing: string[]) {
    super(`Missing required env: ${missing.join(", ")}`);
    this.name = "ConfigError";
    this.missing = Object.freeze([...missing]);
  }
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof ConfigError) return false;
  if (err instanceof ApiError) return err.retryable;
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  if (err instanceof TypeError) return true; // network / fetch errors
  return false;
}

