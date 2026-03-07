import { DomainError } from './DomainError';

export class LLMError extends DomainError {
  readonly code = 'LLM_ERROR' as const;
}
