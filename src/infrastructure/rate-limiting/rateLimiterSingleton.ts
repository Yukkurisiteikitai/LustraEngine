import { createClient } from '@supabase/supabase-js';
import { SupabaseSlidingWindowRateLimiter } from './SupabaseSlidingWindowRateLimiter';

// Factory function: creates a new instance per invocation.
// Cloudflare Workers isolates context per request — module-level singletons
// do not persist across requests, so we use a factory instead.
export function createChatRateLimiter() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return new SupabaseSlidingWindowRateLimiter(
    supabase,
    parseInt(process.env.CHAT_RATE_LIMIT_MAX_TOKENS ?? '50000', 10),
    parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS ?? String(60 * 60 * 1000), 10),
  );
}
