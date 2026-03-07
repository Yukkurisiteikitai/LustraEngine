import { DomainError } from './DomainError';

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
}
