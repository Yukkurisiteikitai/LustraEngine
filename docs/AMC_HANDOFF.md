# AMC Shared Logs Handoff

This document summarizes the AMC shared-log implementation added to `YourselfLM` and the remaining work needed to ship it safely.

## What Was Implemented

- Added the AMC persistence schema in [`supabase/migrations/038_amc_shared_logs.sql`](/Users/yuuto/learn_lab/RecEngine/supabase/migrations/038_amc_shared_logs.sql).
- Added AMC helper modules:
  - [`src/infrastructure/amc/amcAuth.ts`](/Users/yuuto/learn_lab/RecEngine/src/infrastructure/amc/amcAuth.ts)
  - [`src/infrastructure/amc/amcCrypto.ts`](/Users/yuuto/learn_lab/RecEngine/src/infrastructure/amc/amcCrypto.ts)
  - [`src/infrastructure/amc/amcAccess.ts`](/Users/yuuto/learn_lab/RecEngine/src/infrastructure/amc/amcAccess.ts)
- Added AMC API routes:
  - [`app/api/amc/records/init/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/records/init/route.ts)
  - [`app/api/amc/records/[recordId]/revisions/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/records/[recordId]/revisions/route.ts)
  - [`app/api/amc/records/[recordId]/attachments/init/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/records/[recordId]/attachments/init/route.ts)
  - [`app/api/amc/records/[recordId]/attachments/complete/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/records/[recordId]/attachments/complete/route.ts)
  - [`app/api/amc/records/[recordId]/access/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/records/[recordId]/access/route.ts)
  - [`app/api/amc/share-links/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/share-links/route.ts)
  - [`app/api/amc/share-links/[shareLinkId]/revoke/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/share-links/[shareLinkId]/revoke/route.ts)
- Added the web share entry page at [`app/connect/app/amc/share/page.tsx`](/Users/yuuto/learn_lab/RecEngine/app/connect/app/amc/share/page.tsx).
- Added Cloudflare R2 binding declarations in [`wrangler.jsonc`](/Users/yuuto/learn_lab/RecEngine/wrangler.jsonc) and [`cloudflare-env.d.ts`](/Users/yuuto/learn_lab/RecEngine/cloudflare-env.d.ts).
- Added 403 handling via [`src/core/errors/AuthorizationError.ts`](/Users/yuuto/learn_lab/RecEngine/src/core/errors/AuthorizationError.ts) and [`lib/apiHelpers.ts`](/Users/yuuto/learn_lab/RecEngine/lib/apiHelpers.ts).

## Decisions Locked In

- AMC is integrated as a feature of `YourselfLM`, not a separate product.
- Source of truth is `Supabase`.
- Media storage is private Cloudflare R2 bucket `amc-yourselflm`.
- Uploads are client-direct using presigned PUT URLs.
- `limited public` requires both `c=...` and YourselfLM authentication.
- `share_links` is the entry token; `share_grants` is the persistent ACL.
- `revision_number` is stored on `amc_records.current_revision`.
- `amc_record_revisions` stores full-text history snapshots, not diffs.
- Google subject is the canonical identity key and is strictly 1:1 with the canonical YourselfLM user.
- Authorization is `API主導 + RLS補助`.
- Google Calendar mirroring stays enabled and uses full-body sync until the content is too long, then it falls back to `summary + reference URL`.

## Current Data Model Summary

- `amc_google_identities`
  - Links `auth.users.id` to a Google subject.
- `amc_events`
  - Stores the event snapshot and calendar mirror metadata.
- `amc_records`
  - Stores the current body, current revision number, visibility, and soft-delete fields.
- `amc_record_revisions`
  - Append-only full-history table.
- `amc_record_attachments`
  - Stores R2 object key, MIME, size, upload status, and deletion metadata.
- `amc_friendships`
  - Bidirectional friendship table used for `friends` sharing.
- `amc_share_links`
  - Short-lived token + expiry + use-count data.
- `amc_share_grants`
  - Persistent ACL rows for `specific_users`, `friends`, `public`, and `limited_public`.
- `amc_share_access_events`
  - Audit trail for allow/deny access attempts.

## API Contracts

### Record Init

- `POST /api/amc/records/init`
- Creates an event + record bundle.
- Requires:
  - `event.title`
  - `body`
  - `recordIdempotencyKey`
  - `eventIdempotencyKey`
- Returns the created record and event.

### Revision Save

- `POST /api/amc/records/:id/revisions`
- Uses the stored `current_revision` as the optimistic-lock boundary.
- Inserts the revision and updates `amc_records.current_revision/current_body/updated_at` in one transaction.
- Returns `409` on revision conflict.

### Attachment Upload

- `POST /api/amc/records/:id/attachments/init`
- Creates the attachment row and returns a presigned PUT URL for R2.
- `POST /api/amc/records/:id/attachments/complete`
- Marks the attachment as `ready` or `failed`.

### Share Link

- `POST /api/amc/share-links`
- Creates a share link and associated grants.
- `POST /api/amc/share-links/:id/revoke`
- Revokes a link.

### Access Metadata

- `GET /api/amc/records/:id/access`
- Returns view-time metadata only:
  - visibility
  - deleted state
  - edit/delete flags
  - attachment summary
  - access reason

### Web Share Page

- `GET /connect/app/amc/share?c=...`
- Requires YourselfLM login.
- Validates Google subject linkage.
- Resolves the share link and renders a minimal server-side record view.

## Environment Variables

Cloudflare worker/runtime needs:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `AMC_R2_BUCKET` optional, defaults to `amc-yourselflm`

Existing app requirements remain:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Operational Notes

- The new schema assumes `gen_random_uuid()` is available, which matches the existing Supabase migration style.
- The AMC migration is additive and does not modify the legacy `experiences` flow.
- `share_links` creation is idempotent via client idempotency key.
- `revisions`, `attachments/init`, and `records/init` are designed to be safe against duplicate retries.
- All share-access attempts should be audited.

## AI Safety References

- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP LLM02: Insecure Output Handling: https://genai.owasp.org/llm02/
- OWASP Prompt Injection: https://owasp.org/www-community/attacks/PromptInjection
- OWASP LLM Prompt Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework

## AI Risk Review

| Risk | Typical dangerous pattern | State in this repo | Evidence | Action before deploy |
| --- | --- | --- | --- | --- |
| Prompt injection | User or retrieved text is mixed into prompt instructions without a trust boundary | Present | [`src/application/usecases/ChatUseCase.ts`](/Users/yuuto/learn_lab/RecEngine/src/application/usecases/ChatUseCase.ts) and [`app/api/chat/rethink/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/chat/rethink/route.ts) concatenate history into `user:` text | Treat all user/retrieved content as data, not instructions; keep hard boundaries in prompt builders |
| Insecure output handling | LLM output is rendered or executed downstream as HTML/JS/command text | No direct `eval`/`dangerouslySetInnerHTML` found | Repo-wide search did not find `eval(`, `new Function`, or `dangerouslySetInnerHTML`; JSON-facing flows use validators in [`src/application/llm/policies/LLMResponseValidator.ts`](/Users/yuuto/learn_lab/RecEngine/src/application/llm/policies/LLMResponseValidator.ts) | Keep model output as plain text unless sanitized; add tests if markdown/HTML rendering is introduced |
| Overreliance | Model output is treated as diagnosis or truth | Present | [`src/application/llm/chatSystemPrompt.ts`](/Users/yuuto/learn_lab/RecEngine/src/application/llm/chatSystemPrompt.ts) builds psychological summaries and tests enforce softer wording | Keep user-facing copy in "tendency / hypothesis / summary" language only |
| Sensitive info disclosure | Tokens, identities, or personal data leak into logs, URLs, or error pages | Possible | [`app/connect/app/amc/share/page.tsx`](/Users/yuuto/learn_lab/RecEngine/app/connect/app/amc/share/page.tsx) consumes a query token and renders a server-side share view | Confirm tokens never appear in logs, analytics, or referrer-sensitive links |
| Unbounded consumption | Large payloads or repeated calls create DoS/cost spikes | Partially mitigated | [`app/api/chat/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/chat/route.ts) has body-size checks and rate limiting for Claude; AMC endpoints have body limits but no dedicated quota policy yet | Confirm AMC share/access/upload endpoints are covered by operational rate limits and abuse monitoring |
| Excessive agency | The model can trigger side effects directly | Not present in AMC; present elsewhere as a general concern | AMC routes are user-driven; LLM tool execution lives in other flows under explicit use cases | Keep side-effectful flows outside the model boundary; if a tool is added later, require allowlists |
| Share-link safety | Share tokens are reusable, never expire, or revoke is ineffective | Present as a thing to verify | [`app/api/amc/share-links/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/share-links/route.ts) creates tokens; [`app/api/amc/share-links/[shareLinkId]/revoke/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/share-links/[shareLinkId]/revoke/route.ts) revokes them; [`app/connect/app/amc/share/page.tsx`](/Users/yuuto/learn_lab/RecEngine/app/connect/app/amc/share/page.tsx) claims them | Verify expiry, `maxUses`, revoke, and Google login checks in a real deployment |
| R2 credential dependency | Presigned upload/download fails because worker env is missing | Present as a deployment prerequisite | [`app/api/amc/records/[recordId]/attachments/init/route.ts`](/Users/yuuto/learn_lab/RecEngine/app/api/amc/records/[recordId]/attachments/init/route.ts) and [`app/connect/app/amc/share/page.tsx`](/Users/yuuto/learn_lab/RecEngine/app/connect/app/amc/share/page.tsx) require Cloudflare R2 credentials | Provision `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `AMC_R2_BUCKET` before release |
| UI HTML execution | User-visible content is inserted as raw HTML | No direct evidence found | AMC share page renders the body in `<pre>` and the repo search did not surface HTML-injection primitives | Keep the share page text-only unless sanitization is added explicitly |

## Deployment Checklist

### AI Safety

- [ ] User/retrieved text is never treated as privileged instructions
- [ ] Model output is not passed into HTML/JS/SQL/shell contexts without sanitization or validation
- [ ] User-facing language uses "summary", "hypothesis", or "tendency" wording rather than hard diagnosis
- [ ] Any new markdown rendering path has an explicit sanitizer or safe renderer
- [ ] Any new tool/action path has an allowlist and a human-authored policy boundary
- [ ] Prompt injection tests exist for the chat/rethink flows
- [ ] Output validation tests exist for structured LLM responses

### AMC Functionality

- [ ] `supabase/migrations/038_amc_shared_logs.sql` is applied in production
- [ ] RLS is enabled for the AMC tables that are supposed to stay private
- [ ] The private R2 bucket `amc-yourselflm` exists
- [ ] Cloudflare Worker secrets and vars are set for Supabase and R2
- [ ] Attachment init and complete work end-to-end in the real Worker environment
- [ ] Share-link creation, claim, revoke, expiry, and `maxUses` all behave as intended
- [ ] `limited_public` requires both `c=...` and YourselfLM authentication
- [ ] Access audit rows are being written for allow and deny paths
- [ ] There is a clear operational path for failed uploads and revoked links

### General Release

- [ ] `npm run build` passes in the target deployment environment
- [ ] `npx tsc --noEmit` passes in the same environment used for release validation
- [ ] `npm test` passes
- [ ] AMC integration coverage exists for record init, revision conflict, share grant/revoke, and limited public access
- [ ] The share page is validated in a real Cloudflare deployment
- [ ] No secrets or share tokens are printed in logs or error bodies
- [ ] A rollback path exists if AMC migrations or Worker settings need to be reverted

## Verification Status

- `__tests__/amcCrypto.test.ts` exists and covers token and presigned URL helpers.
- `next build` fails in this environment because `app/layout.tsx` fetches Google Fonts and the sandbox cannot reach `fonts.googleapis.com`.
- `npx tsc --noEmit` also fails here because `tsconfig.json` includes generated `.next/types/**/*.ts`, but those files are not present until the Next build pipeline runs.
- The current repo search did not find direct `eval`, `new Function`, or `dangerouslySetInnerHTML` usage.

## Known Gaps

- There is no dedicated AMC record detail/edit page in the main navigation yet.
- The Google Calendar full-mirror behavior is implemented at the API/schema layer, but the final user-facing UX is still incomplete.
- AMC has unit coverage for crypto helpers, but not yet the full integration matrix listed above.
- Production deployment still needs the R2 bucket, Worker secrets/vars, Supabase migration, and a real Cloudflare validation pass.

## Recommended Next Steps

1. Fix the build blockers that are unrelated to AMC, especially the Google Fonts dependency in `app/layout.tsx`.
2. Add integration tests for:
   - record init
   - revision conflicts
   - share-link grant/revoke
   - limited-public access
   - attachment init/complete
3. Validate the Cloudflare deployment with the real R2 bucket and service bindings.
