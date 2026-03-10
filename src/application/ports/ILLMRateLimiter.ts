export interface RateLimitStatus {
  allowed: boolean;
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

export interface ILLMRateLimiter {
  /** LLM 呼び出し前: 残バジェットを確認 */
  check(userId: string): RateLimitStatus;
  /** LLM 呼び出し後: 実消費トークンを記録 */
  record(userId: string, tokens: number): void;
}
