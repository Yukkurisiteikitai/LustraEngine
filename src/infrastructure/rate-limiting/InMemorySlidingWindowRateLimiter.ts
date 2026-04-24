import type { ILLMRateLimiter, RateLimitStatus } from '@/application/ports/ILLMRateLimiter';

export class InMemorySlidingWindowRateLimiter implements ILLMRateLimiter {
  private readonly windows = new Map<string, Array<{ timestamp: number; tokens: number }>>();

  constructor(
    private readonly maxTokens: number,
    private readonly windowMs: number,
  ) {}

  async check(userId: string): Promise<RateLimitStatus> {
    const now = Date.now();
    const entries = this.getActiveEntries(userId, now);
    const usedTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
    const allowed = usedTokens < this.maxTokens;
    const oldest = entries[0]?.timestamp ?? now;
    const resetAtMs = oldest + this.windowMs;
    const avgTokensPerRequest = entries.length > 0 ? usedTokens / entries.length : 0;
    return {
      allowed,
      usedTokens,
      maxTokens: this.maxTokens,
      remainingTokens: Math.max(0, this.maxTokens - usedTokens),
      resetAtMs,
      retryAfterSeconds: allowed ? 0 : Math.ceil((resetAtMs - now) / 1000),
      avgTokensPerRequest,
      requestCount: entries.length,
    };
  }

  async record(userId: string, tokens: number): Promise<void> {
    const now = Date.now();
    const entries = this.getActiveEntries(userId, now);
    entries.push({ timestamp: now, tokens });
    this.windows.set(userId, entries);
  }

  async checkAndRecord(userId: string, tokens: number): Promise<RateLimitStatus> {
    const now = Date.now();
    const entries = this.getActiveEntries(userId, now);
    const usedTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
    const allowed = usedTokens < this.maxTokens;
    const oldest = entries[0]?.timestamp ?? now;
    const resetAtMs = oldest + this.windowMs;
    const avgTokensPerRequest = entries.length > 0 ? usedTokens / entries.length : 0;

    if (allowed) {
      entries.push({ timestamp: now, tokens });
      this.windows.set(userId, entries);
    }

    return {
      allowed,
      usedTokens: allowed ? usedTokens + tokens : usedTokens,
      maxTokens: this.maxTokens,
      remainingTokens: Math.max(0, this.maxTokens - usedTokens - (allowed ? tokens : 0)),
      resetAtMs,
      retryAfterSeconds: allowed ? 0 : Math.ceil((resetAtMs - now) / 1000),
      avgTokensPerRequest,
      requestCount: entries.length,
    };
  }

  private getActiveEntries(userId: string, now: number) {
    const windowStart = now - this.windowMs;
    const all = this.windows.get(userId) ?? [];
    const active = all.filter((e) => e.timestamp > windowStart);
    if (active.length !== all.length) this.windows.set(userId, active);
    return active;
  }
}
