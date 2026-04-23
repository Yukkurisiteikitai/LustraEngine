import type { SupabaseClient } from '@supabase/supabase-js';
import type { ILLMRateLimiter, RateLimitStatus } from '@/application/ports/ILLMRateLimiter';

export class SupabaseSlidingWindowRateLimiter implements ILLMRateLimiter {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly maxTokens: number,
    private readonly windowMs: number,
  ) {}

  async check(userId: string): Promise<RateLimitStatus> {
    const now = Date.now();
    const windowStart = new Date(now - this.windowMs).toISOString();

    const { data, error } = await this.supabase.rpc('get_token_usage_in_window', {
      p_user_id: userId,
      p_window_start: windowStart,
    });

    if (error) {
      console.error('[RateLimiter] check() DB error — failing closed', {
        userId,
        error: error.message,
      });
      return {
        allowed: false,
        usedTokens: this.maxTokens,
        maxTokens: this.maxTokens,
        remainingTokens: 0,
        resetAtMs: now + this.windowMs,
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    if (!data || data.length === 0) {
      return {
        allowed: true,
        usedTokens: 0,
        maxTokens: this.maxTokens,
        remainingTokens: this.maxTokens,
        resetAtMs: now + this.windowMs,
        retryAfterSeconds: 0,
      };
    }

    const { total_used, oldest_window_start } = data[0];
    const usedTokens = Number(total_used);
    const allowed = usedTokens < this.maxTokens;
    const oldestMs = oldest_window_start
      ? new Date(oldest_window_start).getTime()
      : now;
    const resetAtMs = oldestMs + this.windowMs;

    return {
      allowed,
      usedTokens,
      maxTokens: this.maxTokens,
      remainingTokens: Math.max(0, this.maxTokens - usedTokens),
      resetAtMs,
      retryAfterSeconds: allowed ? 0 : Math.ceil((resetAtMs - now) / 1000),
    };
  }

  async record(userId: string, tokens: number): Promise<void> {
    const now = new Date().toISOString();
    await this.supabase.from('token_usage_windows').insert({
      user_id: userId,
      window_start: now,
      used_tokens: tokens,
    });

    // Clean up expired entries (fire-and-forget)
    const expiredBefore = new Date(Date.now() - this.windowMs).toISOString();
    void this.supabase
      .from('token_usage_windows')
      .delete()
      .eq('user_id', userId)
      .lt('window_start', expiredBefore);
  }
}
