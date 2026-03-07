import type { LMConfig } from '@/types';

export const DETECT_PATTERNS_JOB = 'detectPatterns' as const;

export interface DetectPatternsJobPayload {
  userId: string;
  lmConfig: LMConfig;
}
