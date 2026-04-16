function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function safeRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let delay = 300;
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  throw lastError;
}

