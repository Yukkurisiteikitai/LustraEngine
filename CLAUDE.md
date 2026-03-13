# CLAUDE.md — YourselfLM Development Guide

## What This Project Is

YourselfLM is an AI-powered self-reflection app. Users log daily obstacles across five domains (WORK, RELATIONSHIP, HEALTH, MONEY, SELF), and the system asynchronously detects behavioral patterns, infers personality traits, and provides AI coaching via chat.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Auth)
- **State**: TanStack Query v5
- **LLM**: Anthropic Claude API or LM Studio (local). Concurrency managed by `p-limit`.
- **Testing**: Jest + @testing-library/react

## Architecture — Clean Architecture (Strict Boundaries)

ESLint `eslint-plugin-boundaries` enforces layer separation. **Never import from an outer layer into an inner layer.**

```
Domain (src/core/)  ←  Application (src/application/)  ←  Infrastructure (src/infrastructure/)
                                                          ↑
                                              Container (src/container/) wires everything
```

| Layer | Path | Rule |
|---|---|---|
| Domain | `src/core/` | Entities, repository interfaces (ports), domain errors. **Zero external deps.** |
| Application | `src/application/` | Use cases, DTOs, ports (ILLMPort, ILLMRateLimiter), LLM prompts. Depends only on core. |
| Infrastructure | `src/infrastructure/` | Supabase repos, Claude/LMStudio adapters, InMemoryQueue, rate limiter. Implements ports. |
| Container | `src/container/` | Composition root — `createRepositories()`, `createUseCases()`. Only place that knows all layers. |

## Key Async Workflow

```
POST /api/logs → LogExperienceUseCase
  → enqueue: detectPatterns → ProcessExperienceWorkflow.runDetect()
    → DetectPatternsUseCase → enqueue: inferTraits
      → InferTraitsUseCase → updates persona snapshot
```

Pattern detection and trait inference run **asynchronously** after experience logging. They are enqueued via `InMemoryQueue`.

## Commands

```bash
npm install          # Install deps
npm run dev          # Dev server at http://localhost:3000
npm test             # Jest test suite
npm run lint         # ESLint including architecture boundary checks
npm run build        # Production build
supabase db push     # Apply all migrations (001–013)
```

## API Routes

| Endpoint | Method | Notes |
|---|---|---|
| `/api/logs` | POST | Log experience; triggers async pattern detection |
| `/api/chat` | POST | Chat with AI (per-user sliding-window token rate limit) |
| `/api/chat/rethink` | POST | Regenerate assistant response via SSE streaming |
| `/api/patterns/detect` | POST | Manual pattern detection trigger |
| `/api/traits/infer` | POST | Manual trait inference trigger |
| `/api/persona` | GET | Latest persona snapshot |

Chat rate limiting: 429 when token budget exceeded (`CHAT_RATE_LIMIT_MAX_TOKENS`, default 50k/hour). 503 when global LLM concurrency limit hit (`LLM_MAX_CONCURRENT`, default 3).

## Five Experience Domains

WORK, RELATIONSHIP, HEALTH, MONEY, SELF — these are constants used throughout the domain layer.

## File Layout

```
app/                    → Next.js pages + API routes
components/             → Shared React components
lib/                    → Client utilities (Supabase client, hooks, LM config)
src/core/               → Domain entities, ports, errors
src/application/        → Use cases, DTOs, LLM prompts
src/infrastructure/     → Supabase repos, LLM adapters, queue, rate limiter
src/container/          → Composition root
supabase/migrations/    → SQL migrations 001–013
```

## Development Rules

1. **Respect layer boundaries** — `npm run lint` will catch violations. Domain must stay dependency-free.
2. **New repos/adapters** — Define the port (interface) in core or application, implement in infrastructure, wire in container.
3. **LLM prompts** — Live in `src/application/`. Keep them version-controlled and testable.
4. **Database changes** — Add a new numbered migration in `supabase/migrations/`. Never edit existing migration files.
5. **Chat rethink** — Uses SSE streaming. The rethink endpoint regenerates a specific assistant message by its pair node ID.

## Environment Variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Optional: `CHAT_RATE_LIMIT_MAX_TOKENS` (50000), `CHAT_RATE_LIMIT_WINDOW_MS` (3600000), `LLM_MAX_CONCURRENT` (3)