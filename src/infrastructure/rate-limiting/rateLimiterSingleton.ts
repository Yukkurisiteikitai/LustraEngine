import { createClient } from '@supabase/supabase-js';
import { SupabaseSlidingWindowRateLimiter } from './SupabaseSlidingWindowRateLimiter';

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getPositiveIntegerEnvVar(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const parsed = Number.parseInt(rawValue ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid environment variable ${name}: expected positive integer, got "${rawValue}"`);
  }
  return parsed;
}

// Factory function: creates a new instance per invocation.
// Cloudflare Workers isolates context per request — module-level singletons
// do not persist across requests, so we use a factory instead.
export function createChatRateLimiter() {
  const supabaseUrl = getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  const maxTokens = getPositiveIntegerEnvVar('CHAT_RATE_LIMIT_MAX_TOKENS', 50000);
  const windowMs = getPositiveIntegerEnvVar('CHAT_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  return new SupabaseSlidingWindowRateLimiter(supabase, maxTokens, windowMs);
}
