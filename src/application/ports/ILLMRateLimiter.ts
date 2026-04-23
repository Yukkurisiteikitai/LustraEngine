export interface RateLimitStatus {
  allowed: boolean;
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

export interface ILLMRateLimiter {
  /** LLM 呼び出し前: 残バジェットを確認 (fast-fail, non-atomic) */
  check(userId: string): Promise<RateLimitStatus>;
  /** LLM 呼び出し後: 実消費トークンを記録 */
  record(userId: string, tokens: number): Promise<void>;
  /** LLM 呼び出し後: バジェット確認と記録を1トランザクションで実行 (atomic) */
  checkAndRecord(userId: string, tokens: number): Promise<RateLimitStatus>;
}
