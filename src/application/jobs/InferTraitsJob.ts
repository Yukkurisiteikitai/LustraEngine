import type { LMConfig } from '@/types';

export const INFER_TRAITS_JOB = 'inferTraits' as const;

export interface InferTraitsJobPayload {
  userId: string;
  lmConfig: LMConfig;
}
