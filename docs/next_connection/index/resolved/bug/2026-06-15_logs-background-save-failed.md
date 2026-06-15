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

## コミット履歴レビュー結果（2026-06-15 追記）

ユーザの「Copilot 修正あたりから変になった」仮説をコミット履歴で検証。

| commit | 日付 | save パスへの影響 |
|---|---|---|
| `f3eae46 fix: copilot` | 2026-05-21 | 無関係（Trait hypothesis のみ） |
| `f6718f4 fix: copilot` | 2026-05-22 | 無関係（GET 側 `findById` の join 化のみ） |
| **`0e3a491 feat: recrod daily organize colum`** | 2026-06-15 06:50 | **★最有力**。`SupabaseExperienceRepository.save` に `emotions / trigger / time_of_day / duration_minutes` を一括追加し、migration 039（`action_result` 4 値化）を新規導入。INSERT 列増と制約変更が同時に入った起点。 |
| `8ae5a37 fix:reveiew` | 2026-06-15 09:40 | 弱い。Copilot review を受けて validator を厳格化（`context` / `emotions` 必須化など）。エラーは 202 (validator 通過) 後に発生しているため、INSERT 失敗の犯人ではない。ただし extract が「形は通るが中身スカスカで null 返却」になる副作用は別途要観察。 |
| `5e32c3a feat: limit rate provider` | 2026-06-15 11:49 | 修正側。migration 039 の `DROP CONSTRAINT` を `UPDATE` より先に移動、`[logs:bg]` の cause 展開。 |

→ 5月の `fix: copilot` 2件は INSERT パス無関係。**真犯人は `0e3a491` の LLM-1 全面導入**で導入された 4 列 + `action_result` 4 値化のどこか。`8ae5a37` のレビュー修正は INSERT エラーとは独立。

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

## 進捗更新（2026-06-15 第2セッション）

### Extract 段階のブロッカーが解消（commit 166b182）

`POST /api/logs/extract` が 502 で落ちており、INSERT 段階に到達できていなかった。原因は validator が `time_of_day: null` を拒否していたこと（詳細は llm doc 追記3 参照）。

`time_of_day` を nullable に修正したことで、抽出ステップは通過するようになった。**ただし INSERT の成否はまだ未確認**。次セッションで保存まで通してログを確認する必要がある。

### `time_of_day` enum 大文字問題 → 別途解消

以前の候補「`"Morning"` 等の大文字混入 → code `22P02`」については、LLM が `null` を返す場合は validator の nullable 対応で解消された。ただし LLM が `"Morning"` 等の不正文字列を返した場合も nullable 対応後は null 扱いになる（DB に null が入る = ユーザは confirm 画面で「不明」表示を手動変更できる）。

## 次のセッションで最初にやること

### 1. 保存まで通してログを取る（最優先）

```
npm run dev
→ /log/new → 日記入力 → AI 抽出（Step2）→ 領域選択 → 「保存する」
→ ターミナルで [logs:bg] の行を確認
```

**成功した場合**: Supabase で INSERT 確認、bug doc を Resolved に移動。
**失敗した場合**: `cause.code` / `cause.message` / `cause.details` / `cause.hint` を読み、下表で切り分け。

### 2. cause.code 対応表（`42703` は除外済み）

| code | 意味 | 想定原因 | 対応 |
|---|---|---|---|
| `23514` | check constraint violation | `action_result` が4値外 / `intensity` 範囲外 / `duration_minutes < 0` | `scripts/llm1_prompt.py:FEW_SHOTS` で旧値 `CONFRONTED` が混入していないか確認 |
| `22P02` | invalid input syntax for type | `time_of_day` enum に不正値（null 以外、例: 空文字列） | `SupabaseExperienceRepository.save:77` で `o.timeOfDay?.toLowerCase()` 正規化 |
| `23502` | not null violation | `domain_id` が null（domainMap miss） / `stress_level` null | `ensureDefaultDomains` の返却 key と frontend の domain 値が一致しているか確認 |
| `23503` | FK violation | `domain_id` が他ユーザの domain を指す | `ensureDefaultDomains` の戻り値再確認 |
| `42501` | insufficient_privilege | RLS / service role が背景タスクで失効 | `ctx.waitUntil` 内で `createSupabaseServerClient` を再生成 |

## 関連ファイル

- `app/api/logs/route.ts` — backgroundSave のログを今回展開
- `src/infrastructure/repositories/SupabaseExperienceRepository.ts:49-90` — INSERT 本体
- `src/application/usecases/LogExperienceUseCase.ts` — domainMap 構築
- `src/application/llm/policies/LLMResponseValidator.ts` — 4値・enum バリデーション
- `supabase/migrations/039_experience_structured_extraction.sql` — CHECK 制約定義

---

## 解決（2026-06-15 第3セッション）

**解決日**: 2026-06-15  
**解決方法**: 以下の2点を実施して INSERT 成功を確認。

### 原因（確定）

`PGRST204: Could not find the 'careful' column of 'experiences' in the schema cache`

- `careful` 列は migration `034_user_settings_permissions.sql` で追加済み（DB 上は存在する）
- しかし **Supabase PostgREST の schema cache がスタール**になっており、この列を認識していなかった
- INSERT で `careful` を明示指定すると PostgREST がキャッシュ参照に失敗 → PGRST204 → InfrastructureError

### 対応内容

1. **`supabase/migrations/040_ensure_experiences_columns.sql` 新規作成**  
   migration 034 / 039 の列を `IF NOT EXISTS` で再保証（no-op）し、`supabase db push` 経由で PostgREST schema cache をリロード。

2. **`app/api/logs/route.ts` の backgroundSave を admin client に切り替え**  
   `ctx.waitUntil` 内では cookie-based JWT が失効して `42501` になる可能性があるため、`createAdminClient()`（service role key）を使用。userId は `auth.getUser()` で検証済みなので安全。

3. **`[logs:sync]` 診断ログを同期パス（npm run dev）にも追加**  
   `InfrastructureError.cause`（PostgrestError の詳細）がローカル開発でも見えるように。

4. **テスト修正**
   - `__tests__/logsRouteAnalyticsViewCache.test.ts`: `createAdminClient` モック追加
   - `__tests__/LLMResponseValidator.structuredDiary.test.ts`: `time_of_day` nullable 対応（commit 166b182 の仕様変更に合わせる）
