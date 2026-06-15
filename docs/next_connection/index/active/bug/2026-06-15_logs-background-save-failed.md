---
title: POST /api/logs の背景保存で Supabase 書き込みが失敗（cause 未特定）
category: bug
status: active
date: 2026-06-15
tags: [supabase, logs, background-save, experiences, migration-039, postgrest-error, cause]
related: [../llm/2026-06-15_llm1-structured-diary.md, ../infra/2026-06-11_local-llm-setup.md]
---

# POST /api/logs 背景保存失敗 引き継ぎ資料

> 作成: 2026-06-15 / 親セッション: LLM-1 検証中に発覚

---

## 背景

LLM-1 (`/api/logs/extract`) で構造化抽出に成功 → 確認ステップ → 「保存する」で `POST /api/logs` を叩く流れ。
レスポンスは **202 Accepted** で即返るが、`ctx.waitUntil` で走る背景の Supabase INSERT が失敗していた。

## 症状

```
POST /api/logs/extract 200 in 13641ms
POST /api/logs 202 in 367ms
[logs:bg] Supabase書き込み失敗: Error [InfrastructureError]: experience:save failed
    at SupabaseExperienceRepository.save (src/infrastructure/repositories/SupabaseExperienceRepository.ts:88:22)
{
  code: 'INFRASTRUCTURE_ERROR',
  [cause]: [Object]            ← ★ ここの中身が見えていない
}
```

`InfrastructureError.cause` に PostgrestError が入っているはずだが、Node.js inspector の既定深度で `[Object]` に潰されていて、 `code` / `details` / `hint` が見えなかった。

## 今セッションで実施したこと

### ログ詳細化（実施済み）

`app/api/logs/route.ts:backgroundSave` の `catch` を以下に展開:
```ts
const cause = (err as { cause?: unknown })?.cause;
console.error('[logs:bg] Supabase書き込み失敗:', {
  message: err instanceof Error ? err.message : String(err),
  stack: err instanceof Error ? err.stack : undefined,
  cause,
});
```

これで次回の試行時に PostgrestError の `code` / `message` / `details` / `hint` がそのまま出るはず。

### migration 039 適用状況の確認（実施済み）

ユーザ確認: **migration 039 は適用済み**。よって「column emotions does not exist」型のエラー（code `42703`）は原因から除外できる。

### 関連 commit 状態

```
M supabase/migrations/039_experience_structured_extraction.sql
```

039 の SQL ファイル自体は modified（未コミット）。**ユーザの DB には反映済みだが、後で再 push したときに 039 を再実行すると `CREATE TYPE` 重複や `UPDATE` 再実行で空振りになる**ことに注意。migration 039 は `DO $$ ... EXCEPTION WHEN duplicate_object ... $$` と `DROP CONSTRAINT IF EXISTS` で冪等性は確保されているので、再 push しても安全のはず。

## 未解決の問題

### 🔴 HIGH — Supabase INSERT 失敗の真の原因

未特定。次セッションで実機ログから `cause.code` を見て切り分ける。

#### 主な候補と対応

| code | 意味 | 想定原因 | 対応 |
|---|---|---|---|
| `42703` | column does not exist | (除外済み — migration 039 は適用済み) | — |
| `23514` | check constraint violation | `action_result` が4値外（LLM が古い `CONFRONTED` を返した等） / `intensity` 範囲外 / `duration_minutes < 0` | `LLMResponseValidator` の出力を疑う、 `expected_mismatch` を verify スクリプトで再現 |
| `22P02` | invalid input syntax for type | `time_of_day` enum に無い値（大文字混入・空文字など） | LLM 出力を `lower()` 正規化、または validator で reject |
| `23502` | not null violation | `domain_id` が null（domainMap miss）/ `stress_level` が null | `ensureDefaultDomains` が WORK/RELATIONSHIP/HEALTH/MONEY/SELF を返しているか、 frontend の domain 選択値と一致しているか確認 |
| `23503` | foreign key violation | `domain_id` が他ユーザの domain を指している | ensureDefaultDomains の戻りキーを再確認 |
| `42501` | insufficient_privilege | RLS（service role 未使用 等） | `createSupabaseServerClient` が背景タスク時にも有効か。`ctx.waitUntil` で抜けた後の auth context 失効疑い |

#### emotions / time_of_day / duration_minutes の値の流れ

```
LLM extract → ExtractStructuredDiaryUseCase
  → LLMResponseValidator.validateStructuredDiaryResponse()
    → confirmedDraft (LogNewClient.tsx state)
      → POST /api/logs.body.obstacles[]
        → LogRequestBody validator (app/api/logs/route.ts:128-186)
          → LogExperienceUseCase.execute
            → expRepo.save → INSERT
```

validator で弾かれているなら 400 が返るはず。202 が返っているので validator は通過 → INSERT 時に CHECK / NOT NULL / enum 違反のいずれか。

## 次のセッションで最初にやること

### 1. `npm run dev` を再起動して同じ手順を再現

ターミナル出力で `[logs:bg] Supabase書き込み失敗:` の `cause.code` / `cause.message` / `cause.details` / `cause.hint` を確認。

### 2. code に応じて切り分け

上記表に従って原因仮説を1つに絞る。

### 3. 最有力候補 — `time_of_day` enum 大文字

`/no_think` 効かなかったため `chat_template_kwargs: { enable_thinking: false }` を入れたが、それでも LLM が `"Morning"` や `"MORNING"` を返す可能性。`structuredDiaryPrompt.ts` ではプロンプトで小文字を要求しているが、validator は `TIME_OF_DAY_VALUES` 完全一致でチェックしていたか要再確認。

### 4. 別有力候補 — `action_result` の旧値

migration 039 で `CONFRONTED` → `CONFRONTED_SUCCESS` 変換は済んでいるが、LLM が新たに `CONFRONTED` を返したら 23514（check constraint）が出る。few-shot に旧値が混入していないか、`scripts/llm1_prompt.py` の `FEW_SHOTS` を再確認。

## 関連ファイル

- `app/api/logs/route.ts` — backgroundSave のログを今回展開
- `src/infrastructure/repositories/SupabaseExperienceRepository.ts:49-90` — INSERT 本体
- `src/application/usecases/LogExperienceUseCase.ts` — domainMap 構築
- `src/application/llm/policies/LLMResponseValidator.ts` — 4値・enum バリデーション
- `supabase/migrations/039_experience_structured_extraction.sql` — CHECK 制約定義
