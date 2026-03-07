import { LLMError } from '@/core/errors/LLMError';

export class LLMRetryPolicy {
  constructor(
    private readonly maxAttempts = 3,
    private readonly baseDelayMs = 1000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < this.maxAttempts) {
          await new Promise((r) =>
            setTimeout(r, this.baseDelayMs * 2 ** (attempt - 1)),
          );
        }
      }
    }
    throw new LLMError(`LLM failed after ${this.maxAttempts} attempts`, lastError);
  }
}
