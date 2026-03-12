import { createClient } from '@supabase/supabase-js';

function requireEnv(name: 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[createAdminClient] Missing required environment variable: ${name}`);
  }
  return value;
}

function requireSupabaseUrl(): string {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error(
      '[createAdminClient] Missing required environment variable: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL'
    );
  }
  return value;
}

export function createAdminClient() {
  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(
    supabaseUrl,
    serviceRoleKey,
  );
}
