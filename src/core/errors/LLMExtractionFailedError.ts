import { DomainError } from './DomainError';

// Raised when the LLM-1 structured diary extraction did not produce a usable
// JSON object. Callers MUST NOT swallow this into a silent fallback — surface
// it so the user can be told the LLM call failed and retry / edit manually.
// Background: commit eb63919 (chat fallback bug) was exactly this anti-pattern.
export class LLMExtractionFailedError extends DomainError {
  readonly code = 'LLM_EXTRACTION_FAILED' as const;
}
