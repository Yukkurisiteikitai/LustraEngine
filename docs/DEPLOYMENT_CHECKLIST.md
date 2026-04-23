# Deployment Checklist

## Region Configuration
- [ ] Confirm Supabase project region (Dashboard → Settings → General → Region)
- [ ] Confirm `smart_placement.mode = "smart"` is set in `wrangler.jsonc`
- [ ] Verify Supabase region matches primary user geography

## Environment Variables
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set in Cloudflare Workers environment
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in Cloudflare Workers environment
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set as a secret (not plaintext)
- [ ] `CHAT_RATE_LIMIT_MAX_TOKENS` (default: 50000)
- [ ] `CHAT_RATE_LIMIT_WINDOW_MS` (default: 3600000)
- [ ] `LLM_MAX_CONCURRENT` (default: 3)

## Supabase Configuration
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] All migrations applied: `supabase db push`
- [ ] `get_db_stats()` function accessible by service_role only
- [ ] `classify_experience_atomic()` RPC function exists

## Pre-Deploy Checks
- [ ] `npm run build` passes without errors
- [ ] `npm run lint` passes (no architecture boundary violations)
- [ ] `npm test` passes
