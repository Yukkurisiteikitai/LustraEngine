# RecEngine Memory

## Architecture
- **L1**: Input form (`app/log/new/page.tsx`, `components/ObstacleForm.tsx`)
- **L2**: Supabase DB (`supabase/migrations/001_initial.sql`) — users, domains, experiences tables
- **L3**: Cognition layer (patterns) — `supabase/migrations/002_cognition_layer.sql` — episode_clusters, experience_cluster_map, cluster_edges

## Key Files
- `types/index.ts` — all shared types (Domain, ExperienceInput, L3 types, LMConfig)
- `lib/mockQueryClient.tsx` — React Query hooks (useSubmitLogMutation, useExperiences, useAnalytics, usePatterns, usePatternDetection)
- `lib/lmConfig.ts` — localStorage read/write for LMConfig (client-only)
- `lib/patternDetection.ts` — server-side LLM caller (Claude + LM Studio)
- `app/api/logs/route.ts` — GET/POST experiences
- `app/api/patterns/route.ts` — GET clusters + mappings
- `app/api/patterns/detect/route.ts` — POST classify experiences with LM
- `app/patterns/page.tsx` — pattern clusters UI
- `app/settings/page.tsx` — LM provider settings UI

## Patterns / Conventions
- Supabase joined selects return arrays for related tables; cast via `as unknown` then to target type
- LMConfig stored in localStorage key `recengine_lm_config`, never sent to DB
- API keys transmitted only for the duration of a single request from client body
- Fire-and-forget pattern detection in `log/new/page.tsx` after successful log submit

## Completed Layers
- L1 (Input) ✅
- L2 (Data/DB) ✅
- L3 (Cognition/Patterns) ✅
