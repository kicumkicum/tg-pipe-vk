import { isRetryableError } from "./errors";
import type { RequestLogger } from "./log";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function safeRetry<T>(fn: () => Promise<T>, retries = 3, logger?: RequestLogger): Promise<T> {
  let delay = 300;
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) {
        logger?.warn("http.retry.aborted", {
          attempt: i + 1,
          max_attempts: retries,
          reason: "not_retryable",
          error: err instanceof Error ? err.message : String(err)
        });
        throw err;
      }
      if (i < retries - 1) {
        logger?.warn("http.retry.scheduled", {
          attempt: i + 1,
          max_attempts: retries,
          next_delay_ms: delay,
          error: err instanceof Error ? err.message : String(err)
        });
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  logger?.warn("http.retry.exhausted", {
    max_attempts: retries,
    error: lastError instanceof Error ? lastError.message : String(lastError)
  });
  throw lastError;
}

