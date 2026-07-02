---
name: hypothesis-mirror-verification
description: 「構造の鏡」仮説検証層の実装状況・既知の未解決事項
metadata:
  type: project
  status: active
  date: 2026-06-25
---

# 仮説検証層（構造の鏡）実装記録

## 実装完了内容

`supabase/migrations/041_trait_hypothesis_verification.sql` から始まる一連の変更で、
`/persona` ページに「構造の鏡 — 仮説を確認する」セクションを追加した。

### 変更ファイル

| Path | 種別 |
|---|---|
| `supabase/migrations/041_trait_hypothesis_verification.sql` | 新規 |
| `src/core/domains/trait/TraitHypothesis.ts` | 編集（source/revisedFromId/userCorrection/verifiedAt 追加） |
| `src/core/domains/trait/ITraitHypothesisRepository.ts` | 編集（findLiveByUser/findHistoryByTraitKey/reviseAtomic/confirm/hold 追加） |
| `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts` | 編集（上記実装） |
| `src/application/llm/structuralMirrorPrompt.ts` | 新規 |
| `src/application/llm/policies/LLMResponseValidator.ts` | 編集（validateRevisionResponse 追加） |
| `src/application/usecases/VerifyTraitHypothesisUseCase.ts` | 新規 |
| `src/container/createUseCases.ts` | 編集（createVerifyTraitHypothesisUseCase 追加） |
| `app/api/hypotheses/route.ts` | 新規（GET） |
| `app/api/hypotheses/[id]/history/route.ts` | 新規（GET、`id` param = traitKey） |
| `app/api/hypotheses/[id]/verify/route.ts` | 新規（POST、`id` param = hypothesis UUID） |
| `lib/useHypothesisMirror.ts` | 新規 |
| `components/HypothesisMirror.tsx` + `.module.css` | 新規 |
| `app/persona/page.tsx` | 編集（HypothesisMirror マウント 1行） |

## 2026-06-26 セッション更新

- migration 001〜041 を `npx supabase db push` で適用完了
- コード自体にバグなし（findLiveByUser / confirm / hold / reviseAtomic すべて確認済み）
- `/persona` の動作確認（HypothesisMirror の各ボタン）は **未実施**。次セッションで確認すること

## 2026-07-01 セッション更新

### 修正済みバグ（commit 予定）

| # | ファイル | 内容 |
|---|---|---|
| Bug 1 | `src/application/llm/policies/LLMResponseValidator.ts` | `validateRevisionResponse` で `JSON.parse` → `extractJsonFromLLMResponse` に変更。コードフェンス付き JSON を返すローカルLLMで revise が必ず失敗していた |
| Bug 2 | `supabase/migrations/042_fix_revise_hypothesis_atomic.sql` | `revise_hypothesis_atomic` の WHERE 条件を `status IN ('active', 'needs_review')` に変更。hold → revise の連続操作が 500 になるバグを修正。migration 適用済み |
| Bug 3 | `src/application/usecases/VerifyTraitHypothesisUseCase.ts` | `modelVersion: resultModelName` → `modelVersion: 'mirror_v001'` |
| Test  | `__tests__/logsExtractRoute.test.ts` | `lmConfig` 欠如テストのモック修正（既存の 500 バグ → 正しく 400 を期待するよう修正） |

### Supabase プロジェクト ref 修正

正しい ref: `qgvuprwftsrrzjryhbdt`（旧: `archksbnwonqkmzbbahj` は誤り）

```bash
npx supabase link --project-ref qgvuprwftsrrzjryhbdt
npx supabase db push
```

- 初回リンク時に 000〜041 の migration repair が必要だった（migration history が未記録のため）
- 次回以降は `npx supabase db push` だけで OK

### 動作確認状況

- HypothesisMirror の各ボタン（近い・今は答えにくい・違う・精緻化）: ユーザが手動で確認し動作 OK
- revise（LLM 呼び出し）: LM Studio `https://llm.yourselflm.org/v1/` が起動している状態で確認

## 2026-07-01 セッション2 更新（Copilot PR レビュー対応 Round 1）

### 修正済み

| # | ファイル | 内容 |
|---|---|---|
| Sec-1 | `supabase/migrations/043_secure_revise_hypothesis_atomic.sql` | `auth.uid()` ≠ `p_user_id` のとき即エラー（SECURITY DEFINER の RLS バイパス対策）。PUBLIC から REVOKE、authenticated にのみ GRANT。`SET search_path = ''` + `public.` スキーマ修飾で search_path 注入対策も追加。 |
| Acc-1 | `components/HypothesisMirror.tsx` | `role="button"` 要素に Space キー対応・`preventDefault()`・`e.currentTarget !== e.target` のバブリング防止を追加 |
| Infra-1 | `.gitignore` | `supabase/.temp` を追加（Supabase CLI 生成ファイルを誤コミットしないよう除外） |
| Val-1 | `src/application/llm/policies/LLMResponseValidator.ts` | `hypothesisLabel` を `high|medium|low` のみ受け付けるよう制限（任意文字列が DB に保存されるのを防止） |
| API-1 | `app/api/hypotheses/[id]/verify/route.ts` | confirm / hold / revise の全レスポンスを `toDto()` で DTO に絞り、GET `/api/hypotheses` と shape を統一。内部フィールド（score/evidenceIds/modelName 等）の漏洩を防止。 |
| Test-1 | `__tests__/SupabaseTraitHypothesisRepository.new-methods.test.ts` | `findLiveByUser` / `findHistoryByTraitKey` / `confirm` / `hold` / `reviseAtomic` のテスト追加（14 件全 pass） |
| Test-2 | `__tests__/VerifyTraitHypothesisUseCase.test.ts` | `confirm` / `hold` / `revise`（成功・仮説不在・LLM 全失敗・2回目成功・LLM 例外）テスト追加 |

### Copilot レビューで誤検知だったもの

- `/api/hypotheses/[id]/history/route.ts` が存在しないという指摘 → 実際には存在していた。

## 2026-07-01 セッション3 — コードレビュー（/code-review）発見・修正計画

`/code-review` を 8-angle で実施（全発見 CONFIRMED または PLAUSIBLE）。
**次セッションで以下を上から順に修正すること。**

### 2026-07-01 セッション4 — コードレビュー修正完了

以下 8 件を修正済み。

- `SupabaseTraitHypothesisRepository`: dead status に `stale_due_to_evidence_deletion` を追加し、`findLiveByUser` / `confirm` / `hold` のガードへ反映。`findLiveByUser` は `created_at desc, id desc` の二段ソートに変更。
- `app/api/hypotheses/[id]/verify/route.ts`: confirm / hold / revise をすべて `VerifyTraitHypothesisUseCase` 経由に統一。repositories は route 内で一度だけ作成して reuse。
- `VerifyTraitHypothesisUseCase` / `createVerifyTraitHypothesisUseCase`: LLM を nullable にし、revise 時のみ必須チェック。
- `components/HypothesisMirror.tsx`: revise パネル表示前と confirm/hold 前に mutation error を reset。`needs_review` 中は「確認済み」バッジを非表示。
- `supabase/migrations/044_revise_hypothesis_atomic_respects_status.sql`: `revise_hypothesis_atomic` の INSERT status を `coalesce(p_new_row->>'status','active')` に変更する replace migration を追加。
- `__tests__/SupabaseTraitHypothesisRepository.new-methods.test.ts`: dead status ガードと二段ソートの期待を追加。

検証:

```bash
npx tsc --noEmit
npm test -- --runTestsByPath __tests__/SupabaseTraitHypothesisRepository.new-methods.test.ts __tests__/VerifyTraitHypothesisUseCase.test.ts
npm run lint
```

すべて pass。

### 🔴 優先1: DEAD_STATUSES に `stale_due_to_evidence_deletion` が抜けている

**ファイル:** `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts` line 141

**問題:**
```ts
const DEAD_STATUSES = ['revised', 'rejected', 'archived'];
```
`'stale_due_to_evidence_deletion'` は `TraitHypothesisStatus` の正規値だが DEAD_STATUSES に含まれていない。
そのため削除済みエビデンスに紐づく仮説が mirror UI に表示され、ユーザーが revise しようとすると SQL の WHERE 条件（`status IN ('active','needs_review')`）にマッチせず HTTP 500 になる。

**修正:** `'stale_due_to_evidence_deletion'` を DEAD_STATUSES に追加。`hold()` の `.not()` フィルタ（line 230）にも同様に追加。

---

### 🔴 優先2: `confirm()` にステータスガードがない

**ファイル:** `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts` line 204

**問題:**
`hold()` は `.not('status','in','(revised,rejected,archived)')` でデッド行を弾くが、`confirm()` には同等のガードがない。
`status='revised'` の行に `confirm()` が当たると `verified_at` と `source='user_confirm'` が書き込まれ、改訂チェーンが破損する。

**修正:** `confirm()` の UPDATE に `.not('status','in','(revised,rejected,archived)')` を追加。

---

### 🟠 優先3: confirm/hold が VerifyTraitHypothesisUseCase を迂回している

**ファイル:** `app/api/hypotheses/[id]/verify/route.ts` line 65

**問題:**
`revise` アクションは `createVerifyTraitHypothesisUseCase` を呼ぶが、`confirm` と `hold` は `createRepositories(supabase).traitHypothesis.confirm/hold()` を直接呼んでいる。
`VerifyTraitHypothesisUseCase.confirm()` と `.hold()` がデッドコードになっている。
将来 UseCase 側にロジックを追加しても confirm/hold では実行されない。

**修正:** confirm/hold も `useCase.confirm/hold()` 経由に変更。LLM が不要なので `createVerifyTraitHypothesisUseCase(supabase, null as never)` で渡すか、use case のコンストラクタで llm をオプションにする。最もシンプルなのは use case に通さず、代わりに Angle B の指摘通り use case のメソッドを route から消して repository を直呼びするパターンに統一すること（現在の実装を正とする選択）。**要判断。**

---

### 🟠 優先4: SQL の INSERT が status を無視してハードコードしている

**ファイル:** `supabase/migrations/043_secure_revise_hypothesis_atomic.sql` line 36

**問題:**
`toRow(next)` は `status` フィールドを p_new_row JSONB にシリアライズするが、SQL INSERT では `'active'` をハードコード。
`p_new_row->>'status'` は読まれない。現在は呼び出し側が常に `'active'` を渡しているので影響はないが、将来の呼び出し元が違う status を期待すると無言でドロップされる。

**修正:**
- SQL: `'active'` を `coalesce(p_new_row->>'status','active')` に変更（新 migration 044 で `create or replace`）
- または TypeScript 側でコメントを追加して「status フィールドは SQL 側でハードコードされており無効」と明記してシリアライズ自体を外す

---

### 🟡 優先5: revise パネルに confirm/hold の古いエラーが残る

**ファイル:** `components/HypothesisMirror.tsx` line ~141

**問題:**
`useVerifyHypothesis()` フックを confirm・hold・revise で共用しているため、
confirm が失敗した後で revise パネルを開くと `verify.isError` が true のままで
confirm のエラーメッセージが revise パネルに表示される。

**修正:** `setShowRevise(true)` を呼ぶ前（または `onClick` ハンドラ内）で `verify.reset()` を呼ぶ。

---

### 🟡 優先6: confirm→hold で「確認済み」と「保留中」バッジが同時表示される

**ファイル:** `components/HypothesisMirror.tsx` line 121

**問題:**
`confirm()` は `verified_at` をセット（status はそのまま）、`hold()` は `status='needs_review'`（verified_at はそのまま）。
confirm→hold の順で操作すると両バッジが同時表示される。

**修正:** `確認済み` バッジの表示条件を `hypothesis.verifiedAt != null && hypothesis.status !== 'needs_review'` に変更。または confirm が status を 'confirmed'（新ステータス）に変える設計に変更（DB schema 変更が必要）。前者が最小修正。

---

### 🟡 優先7: `findLiveByUser` の dedup が `created_at` 同値時に非決定論的

**ファイル:** `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts` line 160

**問題:**
`.order('created_at', { ascending: false })` のみでソート。同一 `trait_key` に同一 `created_at` の行が2件あると PostgREST の返却順が不定になり、Map の「先勝ち」で異なる仮説が選ばれる。

**修正:** `.order('created_at', { ascending: false }).order('id', { ascending: false })` として UUID の辞書順を第二キーに使う。

---

### 🟢 優先8: revise リクエストで `createRepositories` が二重呼び出し

**ファイル:** `app/api/hypotheses/[id]/verify/route.ts` line 48

**問題:**
route 内で `createRepositories(supabase)` を呼び llmSettings を取得、その後 `createVerifyTraitHypothesisUseCase(supabase, llm)` が内部でも `createRepositories(supabase)` を呼ぶ。リポジトリオブジェクトが2セット生成される。

**修正:** `createVerifyTraitHypothesisUseCase` の引数に `repos` を受け取れるようにするか、route 内で repos を一度だけ作って両方に渡す。

---

## 未解決・次セッションへの注意事項

### 1. spec doc と plan doc の関係

- `docs/hypothesis-verification-claude-code-spec.md`（234行）— Opus が claude.ai 上で書いた
  Claude Code 向け実装指示。git 未追跡（`??`）のままワーキングツリーに存在する。
  §1–§12 形式で実装手順が書かれており、次セッションで参照可能。
- `docs/eval/Attach_Mirrorof_Structure.md` — 今セッションが実際に実装の根拠にしたファイル。
  spec doc との差異（設計意図のすり合わせ・NON-GOALS の明示等）はこちらに記載。

**今回の実装は spec doc を逐語的に追ったのではなく、`Attach_Mirrorof_Structure.md` の
設計意図とコードベースの既存パターンを照合して書いたもの**。
spec doc との細部の差異が気になる場合は両ファイルを読み比べること。

### 2. `[id]` セグメントの二重用途（既知の罠）

Next.js は同一深度に複数の異なる動的セグメント名を許容しないため、
`[traitKey]` と `[id]` を併用しようとして `dev` 起動時にエラーが出た。
現在の構造：

```
app/api/hypotheses/[id]/history/route.ts  → params.id = traitKey（例: "introversion"）
app/api/hypotheses/[id]/verify/route.ts   → params.id = hypothesis UUID
```

セマンティクスが異なるが URL 構造を変えたくなかったためこの形に落ち着いた。
`history/route.ts` 内では `const { id: traitKey } = await params;` として読んでいる。
将来 API を整理する場合は `/api/hypotheses/history/[traitKey]` に移すのが素直。

### 3. フェーズ2（矛盾プローブ）は未実装

矛盾を突く「鏡の問い」生成・`/api/hypotheses/probe/answer` ループは
明示的にフェーズ2とされ、今回は実装していない。ファイルも作っていない。

### 4. `/persona` の数値%表示と新コンポーネントの非数値表示が並存

既存「現在の仮説要約」セクション（confidence/uncertainty を `%` で表示）と
新しい `<HypothesisMirror />` セクション（非数値、高/中/低の質的表示）が
同じページに共存している。将来どちらかに統一する判断が必要。
現状はどちらも残っている。

### 5. `supabase db push` — **解決済み（2026-06-26）**

migration 001〜041 を以下のコマンドで一括適用済み：

```bash
npx supabase login
npx supabase link --project-ref qgvuprwftsrrzjryhbdt
npx supabase db push
```

**注意点（次回以降も有効）：**
- `supabase` コマンドは PATH になく、`npx supabase` で呼ぶ必要がある
- Supabase Studio の SQL エディタに migration を直接貼り付けてはいけない。
  前提となる migration（例: 031 が作る `trait_hypothesis_history` テーブル）が
  未適用だと `42P01 relation does not exist` で失敗する
- `supabase link` 時のプロジェクト ref: `qgvuprwftsrrzjryhbdt`

### 6. テストは未作成

計画（§10）のテストは未実装。
`VerifyTraitHypothesisUseCase` のユニットテストと
`SupabaseTraitHypothesisRepository` の統合テストが必要。

**Why:** 実装の正確性を保証するため、特に `reviseAtomic` の DB 反映と
LLM 再試行ロジックのテストは優先度が高い。

**How to apply:** 次セッションで余裕があればテスト追加を優先すること。
