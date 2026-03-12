import { DomainError } from './DomainError';

export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMIT_ERROR' as const;
  constructor(
    message: string,
    public readonly context: {
      userId: string;
      usedTokens: number;
      maxTokens: number;
      retryAfterSeconds: number;
    },
    cause?: unknown,
  ) {
    super(message, cause);
  }
}
