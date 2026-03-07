import { DomainError } from './DomainError';

export class InfrastructureError extends DomainError {
  readonly code = 'INFRASTRUCTURE_ERROR' as const;
}
