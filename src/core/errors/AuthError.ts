import { DomainError } from './DomainError';

export class AuthError extends DomainError {
  readonly code = 'AUTH_ERROR' as const;
}
