import { DomainError } from './DomainError';

export class LLMConcurrencyError extends DomainError {
  readonly code = 'LLM_CONCURRENCY_ERROR' as const;
  constructor(
    message: string,
    public readonly context: {
      endpoint: string;
      activeCount: number;
      maxConcurrency: number;
    },
    cause?: unknown,
  ) {
    super(message, cause);
  }
}
