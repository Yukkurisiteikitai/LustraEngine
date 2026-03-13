# YourselfLM

> An AI-powered self-reflection app that turns daily experiences into behavioral patterns, personality traits, and personalized coaching.

## Features

- **Experience Logging** — Log daily obstacles across five domains: WORK, RELATIONSHIP, HEALTH, MONEY, and SELF
- **Pattern Detection** — LLM asynchronously clusters logged experiences into behavioral patterns (procrastination, social avoidance, authority anxiety, perfectionism, etc.)
- **Trait Inference** — LLM infers personality trait scores (introversion, discipline, curiosity, etc.) from accumulated patterns
- **AI Chat** — Conversational AI assistant with full context of your persona and recent experiences; includes answer regeneration (Rethink / やり直す) via SSE streaming
- **Analytics Dashboard** — Visualizes confrontation rate, stress trends, and streak counts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Supabase (PostgreSQL + Auth) |
| State | TanStack Query v5 |
| LLM | Claude (Anthropic API) / LM Studio (local) |
| Concurrency | p-limit |
| Testing | Jest + @testing-library/react |

## Architecture

This project follows **Clean Architecture** with strict layer boundaries enforced by ESLint `eslint-plugin-boundaries`.

```
┌─────────────────────────────────────────────┐
│  Next.js App Router  (app/)                 │
│  Components          (components/)          │
└────────────────────┬────────────────────────┘
                     │ HTTP / Server Actions
┌────────────────────▼────────────────────────┐
│  Container  (src/container/)                │  ← Composition Root
│  createRepositories · createUseCases        │
└──────┬─────────────┬──────────────┬─────────┘
       │             │              │
┌──────▼──────┐ ┌────▼──────┐ ┌────▼──────────────┐
│  core/      │ │ applic/   │ │ infrastructure/   │
│  Entities   │◄│ UseCases  │◄│ Supabase Repos    │
│  Ports      │ │ Ports     │ │ Claude / LMStudio │
│  Errors     │ │ DTOs      │ │ InMemoryQueue     │
└─────────────┘ └───────────┘ └───────────────────┘
```

| Layer | Path | Responsibility |
|-------|------|---------------|
| Domain | `src/core/` | Entities, repository interfaces, domain errors — zero external dependencies |
| Application | `src/application/` | Use cases, DTOs, ports (ILLMPort, ILLMRateLimiter), LLM prompts |
| Infrastructure | `src/infrastructure/` | Supabase repositories, Claude/LMStudio adapters, InMemoryQueue, rate limiter |
| Container | `src/container/` | Wires all layers together (Composition Root) |

### Async Workflow

```
POST /api/logs
  └─ LogExperienceUseCase
       └─ enqueue: detectPatterns
            └─ ProcessExperienceWorkflow.runDetect()
                 └─ DetectPatternsUseCase  →  enqueue: inferTraits
                      └─ InferTraitsUseCase  →  updates persona snapshot
```

## Getting Started

### Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- An Anthropic API key **or** a running [LM Studio](https://lmstudio.ai/) instance

### Environment Variables

Copy `.env.local.example` and fill in the values:

```bash
cp .env.local.example .env.local
```

**Required:**

```env
NEXT_PUBLIC_SUPABASE_URL=        # Your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=       # Service role key (used for LLM token recording)
```

**Optional (defaults shown):**

```env
CHAT_RATE_LIMIT_MAX_TOKENS=50000    # Per-user token budget per window
CHAT_RATE_LIMIT_WINDOW_MS=3600000   # Sliding window size in ms (1 hour)
LLM_MAX_CONCURRENT=3                # Max concurrent LLM requests globally
```

### Database Setup

```bash
# Push all migrations to your Supabase project
supabase db push

# Or apply migrations manually in order (001 through 013)
```

### Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # Run Jest test suite
npm run lint     # ESLint (includes architecture boundary checks)
npm run build    # Production build
```

## Project Structure

```
RecEngine/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── chat/           # POST /api/chat, POST /api/chat/rethink (SSE)
│   │   ├── logs/           # POST /api/logs
│   │   ├── patterns/       # POST /api/patterns/detect
│   │   ├── traits/         # POST /api/traits/infer
│   │   └── persona/        # GET /api/persona
│   ├── chat/               # AI chat UI
│   ├── dashboard/          # Analytics (Server Component)
│   ├── patterns/           # Pattern list (Server Component)
│   └── persona/            # Persona view (Server Component)
├── components/             # Shared React components
├── lib/                    # Client-side utilities (supabase client, lmConfig, hooks)
├── src/
│   ├── core/               # Domain layer
│   ├── application/        # Use case layer
│   ├── infrastructure/     # External adapters layer
│   └── container/          # Composition root
├── supabase/
│   └── migrations/         # SQL migrations (001–013)
└── public/                 # Static assets
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/logs` | Record an experience; asynchronously triggers pattern detection |
| `POST` | `/api/chat` | Send a chat message (per-user rate limiting applied) |
| `POST` | `/api/chat/rethink` | Regenerate an assistant response for a pair node (SSE streaming) |
| `POST` | `/api/patterns/detect` | Manually trigger pattern detection job |
| `POST` | `/api/traits/infer` | Manually trigger trait inference job |
| `GET`  | `/api/persona` | Retrieve the latest persona snapshot |

### Chat Rate Limiting

The `/api/chat` endpoint enforces a sliding-window token budget per user. When the budget is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header. If the global LLM concurrency limit is reached, it returns `503 Service Unavailable`.

## License

MIT
