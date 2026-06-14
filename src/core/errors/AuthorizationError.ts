import { DomainError } from './DomainError';

export class AuthorizationError extends DomainError {
  readonly code = 'AUTHORIZATION_ERROR' as const;
}
