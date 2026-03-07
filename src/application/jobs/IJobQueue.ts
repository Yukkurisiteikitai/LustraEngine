import type { DetectPatternsJobPayload } from './DetectPatternsJob';
import type { InferTraitsJobPayload } from './InferTraitsJob';

// job payload 型を registry で一元管理
export type JobMap = {
  detectPatterns: DetectPatternsJobPayload;
  inferTraits: InferTraitsJobPayload;
};

// enqueue は K extends keyof JobMap で型推論 → typo防止 + refactor安全
export interface IJobQueue {
  enqueue<K extends keyof JobMap>(job: K, payload: JobMap[K]): Promise<void>;
}
