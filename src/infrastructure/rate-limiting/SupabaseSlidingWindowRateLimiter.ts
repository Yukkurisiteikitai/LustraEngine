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

    const { data, error } = await this.supabase
      .from('token_usage_windows')
      .select('used_tokens, window_start')
      .eq('user_id', userId)
      .gte('window_start', windowStart)
      .order('window_start', { ascending: true });

    if (error) {
      // On DB error, fail open to avoid blocking users
      return {
        allowed: true,
        usedTokens: 0,
        maxTokens: this.maxTokens,
        remainingTokens: this.maxTokens,
        resetAtMs: now + this.windowMs,
        retryAfterSeconds: 0,
      };
    }

    const rows = data ?? [];
    const usedTokens = rows.reduce((sum, r) => sum + (r.used_tokens as number), 0);
    const allowed = usedTokens < this.maxTokens;
    const oldestMs = rows.length > 0
      ? new Date(rows[0].window_start as string).getTime()
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
