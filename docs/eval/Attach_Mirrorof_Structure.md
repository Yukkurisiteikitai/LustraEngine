# Plan: trait_hypothesis_history に「構造の鏡」検証層をアタッチ

## Context

`InferTraitsUseCase` が生成する trait 仮説は、現状 `/persona` ページで `Math.round(confidence*100)% / Math.round(uncertainty*100)%` という数値として表示され、訂正・確認の経路がない（`app/persona/page.tsx:108-116`）。

これは単なる UI の手薄さではなく、ユーザ自身が claude.ai 上で行った調査・対話（本セッションに貼られた会話ログ）に基づく具体的な懸念に根ざしている：CBT の cognitive distortion・McAdams の narrative sequence (redemption/contamination)・Big Five・identity status といった枠組みは WEIRD（西洋・教育・産業・富裕・民主）集団で標準化されたものであり、日本語の自己卑下・「仕方ない」型受容・本音建前のような文化的に正常な語りを偽陽性で「歪み」「不健全」と病理化するリスクが実証研究で指摘されている。実際、`LLMResponseValidator.extractPsychologyAnalysis`（`src/application/llm/policies/LLMResponseValidator.ts:97-140`）は `cognitive_distortions`・`narrativeSequence`・`attributionLocus/Stability/Controllability` をすでに抽出しており、これがまさにそのリスク領域。

会話の中でユーザと Claude (Opus) は、対策を「分類器（スコア・ラベルを確定として出す）」ではなく「構造の鏡（人がどう動くかの構造仮説を、本人の訂正を一次データとして対話的に組み上げ、中立な仮説として外に堆積させる）」と定義し、実際に動くデモ（Claude を裏で叩く React コンポーネント、ノードを訂正すると更新される）を作った。その後ユーザは「これを仮説検証の部分にアタッチしたい」と依頼し、Opus がその実装指示書（`docs/hypothesis-verification-claude-code-spec.md` という名で言及）を artifact として書いた。

**重要な経緯**: その artifact の本文（§1–§12 の正確な文言、`STRUCTURAL_MIRROR_SYSTEM` の verbatim テキスト）はこのリポジトリにも、Claude Code のセッション履歴にも存在しない。前段の draft plan はこのファイルを実在するものとして引用していたが、調査の結果 git 履歴・ファイルシステムのどこにも存在しないことを確認した。ユーザが claude.ai の会話ログ全文（4 件の paste）を提供してくれたことで、artifact の**本文ではなく**、それを生んだ会話の**設計意図**を直接確認できた。本計画はその設計意図と、実コードベースの既存パターンの両方をすり合わせて書き直したものであり、「スペックの実装」ではなく「この会話で確定した設計をこのコードベースの作法で実装する」という体裁になっている。

確認できた設計意図（会話より）:
- アタッチ先は `trait_hypothesis_history`（既に append-only、`status` に `revised/rejected/archived` を持つ）。これは構わず使う。
- 「堆積ログは新規に作らず、仮説履歴そのものを見せます」— 訂正の蓄積表示に**新しいテーブルを作らない**。
- atomic 更新は `classify_experience_atomic`（`004_classify_atomic.sql`）と同じ「`SECURITY DEFINER` + `plpgsql` の単一 RPC」パターンに倣う。
- NON-GOALS が明示されていた：既存ジョブ（`InferTraitsUseCase`/`DetectPatternsUseCase`/`AnalysisJobConsumer`）を変えない、`big_five_scores`/`identity_status`/`attachment_profile` に書き込まない、破壊的 UPDATE をしない、**ブラウザから LLM を直接叩かない**（デモはブラウザ直叩きだったが、本番化にあたり明示的にサーバ側 API 経由に変更すると会話内で決定済み）。
- 矛盾を突く「鏡の問い」ループ（`/probe/answer` 的な機能）は明示的にフェーズ2。
- UI は数値・パーセンテージを露出しない。確信度は高/中/低の質的表現。中立・非病理的な記述（「自己評価を控えめに述べる傾向」等）。

ゴール: ユーザが `/persona` 画面で生きている仮説を見て、confirm（近い）/ revise（違う・精緻化、訂正文を入力すると LLM が中立な構造記述に改訂）/ hold（今は答えにくい）の3アクションを取れるようにする。revise は append-only の新行として履歴に積み、旧行は `revised` になる。confirm は既存行に `verified_at` を追記するだけ（破壊なし）。hold は既存の `needs_review` ステータスへの遷移として表現する（新テーブル不要）。

## 既存資産（そのまま使う）

- スキーマ: `supabase/migrations/031_trait_hypothesis_history.sql`（append-only, RLS `user_id = auth.uid()`）+ `035_trait_hypothesis_status_review.sql`（status に `needs_review`/`stale_due_to_evidence_deletion` を追加済み）。直近の番号は `040_ensure_experiences_columns.sql` → 新規は **`041`**。
- 型: `src/core/domains/trait/TraitHypothesis.ts` — `TraitHypothesisStatus` は既に `needs_review` を含む。
- Port/Repo: `src/core/domains/trait/ITraitHypothesisRepository.ts` / `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts`（`toRow`/`fromRow`、`InfrastructureError` 経由）。既存メソッド `append/appendMany/findByUser/findAllByUser/findActiveByUser/markRevised/markStatusByEvidenceIds` は温存。
- LLM: `ILLMPort.generate(systemPrompt, userMessage, maxTokens) → {text, tokenUsage, modelName}`、`LLMRetryPolicy.execute()`（3回・指数バックオフ）、`LLMResponseValidator`（同じクラスに新メソッドを足す）。
- LLM 起動: `createLLM(config, { waitForSlot, endpoint })`（`src/infrastructure/llm/createLLM.ts`）が内部で `ConcurrentLLMAdapter` を自動で挟む。手動でラップしない。`resolveStoredLlmConfig(userId, lmConfig, llmSettingsRepo, encryptionKey)` でユーザの LLM 設定（Claude or LM Studio）を解決する（`app/api/patterns/detect/route.ts` がこのパターン）。
- Atomic RPC パターン: `supabase/migrations/004_classify_atomic.sql`（`SECURITY DEFINER`、`plpgsql`、ループ内 upsert）。
- API 雛形: `app/api/logs/[experienceId]/route.ts`（`params: Promise<{...}>` を await、`createSupabaseServerClient → auth.getUser → AuthError`、`checkBodySize`、`handleError`）。
- エラー: `lib/apiHelpers.ts` の `handleError`。`LLMExtractionFailedError`（502, `code: 'LLM_EXTRACTION_FAILED'`）を LLM 出力が使えない場合に使う。
- Container: `src/container/createUseCases.ts`（`createXxxUseCase(supabase, llm)` ファクトリ群）、`src/container/createRepositories.ts`。
- フロント: `app/persona/page.tsx`（サーバコンポーネント）+ `app/persona/TraitInferButton.tsx`（`'use client'`、fetch、`router.refresh()`）。`lib/mockQueryClient.tsx`（TanStack Query フック集約、`'use client'`、`useMutation`/`useQuery`、`json.message` でエラー抽出）。CSS 変数は `app/globals.css`（`--surface-card`, `--text-primary`, `--font-serif` = Playfair 等）、`.module.css` 規約。
- 既存 prompt 配置: `src/application/llm/traitInferencePrompt.ts`（フラット配置、`TRAIT_SYSTEM_PROMPT` と `buildXxxUserMessage` をエクスポート）。新規 prompt もこの並びに置く。

## 設計上の決定（前段 draft からの主な変更点）

1. **`held_territories` テーブルを作らない**。「今は答えにくい」(hold) は `trait_hypothesis_history.status` を既存の `needs_review` に更新するだけ。新規行・新規テーブルなし。これは会話内の「堆積ログは新規に作らず、仮説履歴そのものを見せます」という明示的な方針と、既存スキーマがすでに `needs_review` を持っているという事実の両方に合致する。
2. **`STRUCTURAL_MIRROR_SYSTEM` を verbatim 引用しない**。元の artifact 本文を持っていないため、会話で確認できた要件（病理ラベル禁止・構造記述・仮説スタンス・矛盾は問いとして返す・日本語の謙遜/仕方ない/本音建前を症状と読まない・スコアを出力しない）を満たす prompt を `traitInferencePrompt.ts` の文体に揃えて新規に書く。
3. **`createLLM(config, { waitForSlot: false, endpoint })` を直接呼ぶ**。手動で `ConcurrentLLMAdapter` をラップしない（既に内包されている）。
4. **`/persona` の既存「現在の仮説要約」セクション（%表示）は残す**。新セクションを追加するのみ。数値表示の置き換えは今回のスコープ外（ユーザが望むなら別タスク）。

## 実装ステップ

### 1. スキーマ — `supabase/migrations/041_trait_hypothesis_verification.sql`（新規）

```sql
alter table trait_hypothesis_history
  add column if not exists revised_from_id uuid references trait_hypothesis_history(id),
  add column if not exists source text not null default 'model',
  add column if not exists user_correction text,
  add column if not exists verified_at timestamptz;

alter table trait_hypothesis_history
  add constraint trait_hypothesis_history_source_check
  check (source in ('model','user_revision','user_confirm'));

create index if not exists idx_trait_hypothesis_history_revised_from
  on trait_hypothesis_history (revised_from_id);

-- 004_classify_atomic.sql と同じ atomic パターン:
-- 旧行を revised に倒し、superseded_by/revised_from を結線し、新行を挿入を1トランザクションで。
create or replace function revise_hypothesis_atomic(
  p_user_id uuid,
  p_prev_id uuid,
  p_new_row jsonb
) returns trait_hypothesis_history
language plpgsql security definer as $$
declare
  v_new_id uuid;
  v_result trait_hypothesis_history%rowtype;
begin
  v_new_id := coalesce((p_new_row->>'id')::uuid, gen_random_uuid());

  insert into trait_hypothesis_history (
    id, user_id, trait_key, hypothesis_label, hypothesis_text,
    score, confidence, uncertainty, evidence_ids, source_pattern_ids,
    model_name, model_version, prompt_version,
    status, supersedes_hypothesis_id, revised_from_id,
    source, user_correction, analysis_job_id
  ) values (
    v_new_id, p_user_id,
    p_new_row->>'trait_key', p_new_row->>'hypothesis_label', p_new_row->>'hypothesis_text',
    nullif(p_new_row->>'score','')::real,
    coalesce((p_new_row->>'confidence')::real, 0.1),
    coalesce((p_new_row->>'uncertainty')::real, 0.5),
    coalesce(p_new_row->'evidence_ids', '[]'::jsonb),
    coalesce(p_new_row->'source_pattern_ids', '[]'::jsonb),
    p_new_row->>'model_name', p_new_row->>'model_version', p_new_row->>'prompt_version',
    'active', p_prev_id, p_prev_id,
    coalesce(p_new_row->>'source', 'user_revision'),
    p_new_row->>'user_correction',
    nullif(p_new_row->>'analysis_job_id','')::uuid
  ) returning * into v_result;

  update trait_hypothesis_history
    set status = 'revised', superseded_by_hypothesis_id = v_new_id, updated_at = now()
    where id = p_prev_id and user_id = p_user_id and status = 'active';

  if not found then
    raise exception 'revise_hypothesis_atomic: previous hypothesis not active or not owned';
  end if;

  return v_result;
end; $$;
```

`needs_review`（hold）への遷移は通常の `UPDATE` で十分（atomic RPC 不要、競合の余地がない単純な状態遷移）。

### 2. ドメイン型 — `src/core/domains/trait/TraitHypothesis.ts`

`TraitHypothesisRecord` と `TraitHypothesisInsert` に追加:

```ts
source: 'model' | 'user_revision' | 'user_confirm';
revisedFromId?: string | null;
userCorrection?: string | null;
verifiedAt?: string | null;
```

既存呼び出し元（`InferTraitsUseCase` の `buildHypotheses`）は `source` を渡していないため、`toRow` 側で `source: record.source ?? 'model'` のデフォルトを必ず入れる（既存コードを壊さない）。

### 3. Port — `src/core/domains/trait/ITraitHypothesisRepository.ts`

既存メソッドは変更せず追加:

```ts
findLiveByUser(userId: string): Promise<TraitHypothesisRecord[]>;
findHistoryByTraitKey(userId: string, traitKey: string): Promise<TraitHypothesisRecord[]>;
reviseAtomic(prevId: string, userId: string, next: TraitHypothesisInsert): Promise<TraitHypothesisRecord>;
confirm(id: string, userId: string): Promise<TraitHypothesisRecord>;
hold(id: string, userId: string): Promise<TraitHypothesisRecord>;
```

「live」= `status not in ('revised','rejected','archived')`（`needs_review`/`stale_due_to_evidence_deletion` を含む。`findActiveByUser` は `status='active'` 限定なので別物として残す）。`reject` は今回スコープ外（confirm/revise/hold の3アクションのみ）。

### 4. Repo — `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts`

- `toRow`/`fromRow` を `source`/`revised_from_id`/`user_correction`/`verified_at` まで拡張。
- `findLiveByUser`: `status not in (...)` で取得し、trait_key ごとに `created_at` 最新の1件のみ JS 側で絞る（既存 `fetchAllByUser` のページングを再利用する形で実装）。
- `findHistoryByTraitKey`: `user_id, trait_key` で全件、`created_at desc`。
- `reviseAtomic`: `this.supabase.rpc('revise_hypothesis_atomic', { p_user_id: userId, p_prev_id: prevId, p_new_row: toRow(next) })` → `fromRow(data)`。
- `confirm`: `UPDATE ... SET verified_at = now() WHERE id=? AND user_id=?` → 更新後の行を `select().single()` で取得して `fromRow`。
- `hold`: `UPDATE ... SET status='needs_review', updated_at=now() WHERE id=? AND user_id=? AND status NOT IN ('revised','rejected','archived')` → 同様に返す。

### 5. Prompt — `src/application/llm/structuralMirrorPrompt.ts`（新規）

`traitInferencePrompt.ts` と同じ構造（`export const ..._SYSTEM_PROMPT` + `export function buildXxxUserMessage(...)`）。新規に書く（artifact 本文を持っていないため verbatim コピーではない）。要件は会話から確認済みのもののみを反映する：

- 病理ラベル（低自尊心・抑うつ・認知の歪み・foreclosure 等）を出力に含めない。
- 確定診断ではなく改訂可能な仮説として書く（「〜という傾向が見える」「〜とログ上で共起している」）。
- 日本語の自己卑下・「仕方ない」・本音建前・amae を症状として読まない。
- スコア・パーセンテージを文中に出さない。
- 入力: 改訂対象の現在の仮説テキスト、ユーザの訂正文 (`correctionText`)、同一ユーザの他の live 仮説（矛盾チェックの文脈用、ただし矛盾を突く機能自体はフェーズ2のため出力には使わない）。
- 出力 JSON: `{ "hypothesisText": string, "hypothesisLabel": string, "confidence": number, "uncertainty": number }`（`trait_key`/`score` は引き渡し元から固定値で補完するため LLM 出力に含めない）。

`LLMResponseValidator` に `validateRevisionResponse(raw: string): { hypothesisText: string; hypothesisLabel: string; confidence: number; uncertainty: number } | null` を追加（既存の `validateBigFiveResponse` と同じ try/JSON.parse/clamp の形）。簡易な病理語スクリーニング（禁止語リストとの突き合わせ）もここで行い、引っかかったら `null` を返して呼び出し側に再生成 or `LLMExtractionFailedError` を委ねる。

### 6. UseCase — `src/application/usecases/VerifyTraitHypothesisUseCase.ts`（新規）

`InferTraitsUseCase` と同じコンストラクタ形（`traitHypothesisRepo, llm, logger, retry, validator`）。メソッド:

- `confirm(userId, hypothesisId)` → `repo.confirm(id, userId)`。LLM 不要。
- `hold(userId, hypothesisId)` → `repo.hold(id, userId)`。LLM 不要。
- `revise(userId, hypothesisId, correctionText)`:
  1. `repo.findLiveByUser(userId)` で対象仮説と他の live 仮説を取得。対象が見つからなければ `ValidationError`。
  2. `structuralMirrorPrompt` の system + `buildReviseUserMessage(target, others, correctionText)` で `this.retry.execute(() => this.llm.generate(...))`。
  3. `validator.validateRevisionResponse(text)`。`null` なら 1 回だけ再生成、再度 `null` なら `LLMExtractionFailedError`。
  4. `repo.reviseAtomic(hypothesisId, userId, { ...target からコピー（traitKey/evidenceIds/sourcePatternIds等）, hypothesisText, hypothesisLabel, confidence, uncertainty, source: 'user_revision', revisedFromId: hypothesisId, userCorrection: correctionText, modelName: result.modelName, modelVersion: result.modelName, promptVersion: 'mirror_v001' })`。
  5. 新しい record を返す。

### 7. Container — `src/container/createUseCases.ts`

```ts
export function createVerifyTraitHypothesisUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { traitHypothesis } = createRepositories(supabase);
  return new VerifyTraitHypothesisUseCase(
    traitHypothesis, llm, logger, new LLMRetryPolicy(), new LLMResponseValidator(),
  );
}
```

### 8. API Routes

既存 `app/api/logs/[experienceId]/route.ts` / `app/api/patterns/detect/route.ts` のパターンに従う（`createSupabaseServerClient → auth.getUser → AuthError`、`params: Promise<{...}>` await、`checkBodySize`、`handleError`）。

- **`app/api/hypotheses/route.ts`** `GET` — `repo.findLiveByUser(user.id)` を返す（`score` は応答 DTO から除外、`hypothesisText/hypothesisLabel/confidence/uncertainty/traitKey/id/status/createdAt` のみ）。
- **`app/api/hypotheses/[traitKey]/history/route.ts`** `GET` — `params` await、`repo.findHistoryByTraitKey(user.id, traitKey)`。
- **`app/api/hypotheses/[id]/verify/route.ts`** `POST` — body `{ action: 'confirm' | 'revise' | 'hold', correction?: string }`。`confirm`/`hold` は LLM 不要で UseCase を直接呼ぶ。`revise` のみ `resolveStoredLlmConfig` + `createLLM(config, { waitForSlot: false, endpoint: 'hypotheses-verify' })` を呼んで 503 マッピングを自動化（`patterns/detect` route と同じ流れ）。`correction` が空文字なら `ValidationError`。

フェーズ2（今回は実装しない、ファイルも作らない）: 矛盾を突く「鏡の問い」生成・`/api/hypotheses/probe/answer`。

### 9. フロントエンド

- **`lib/useHypothesisMirror.ts`**（新規）— `mockQueryClient.tsx` と同じ書式（`'use client'`、fetch + `json.message` エラー抽出）で `useLiveHypotheses()`（`useQuery`）、`useHypothesisHistory(traitKey)`（`useQuery`）、`useVerifyHypothesis()`（`useMutation`、成功時に `queryClient.invalidateQueries` で live 一覧を再取得）を export。
- **`components/HypothesisMirror.tsx` + `HypothesisMirror.module.css`**（新規、`'use client'`）—
  - カードは `--font-serif` で仮説文を表示。スコア・%は出さない。確信度は「高/中/低」のテキスト + 3段階の点で表現（`confidence` を3バケットに丸める）。
  - ボタン3つ：「近い」(confirm) / 「違う・精緻化」(revise — クリックで textarea を開き、送信時に `useVerifyHypothesis()` を `action: 'revise'` で呼ぶ) / 「今は答えにくい」(hold)。
  - 別パネルで「訂正の堆積」: `useHypothesisHistory(traitKey)` を選択中のカードについて呼び、append-only チェーンを時系列で表示。
  - 色・タイポは `app/globals.css` の変数を使う（Tailwind ではなく `.module.css`、既存規約通り）。
- **マウント**: `app/persona/page.tsx` の既存「現在の仮説要約」セクションの直後に `<HypothesisMirror />` を追加する1行。既存セクションは変更しない。

### 10. テスト

- `SupabaseTraitHypothesisRepository`: `reviseAtomic` が DB に反映されること（旧行 `revised`、新行 `source='user_revision'`・`revised_from_id` 結線）、`findLiveByUser` が `revised/rejected/archived` を除外すること、`confirm` が `verified_at` のみ追記し本文を変えないこと、`hold` が `needs_review` に遷移すること。
- `VerifyTraitHypothesisUseCase`: LLM をモックし、`revise` が `reviseAtomic` を正しい引数で呼ぶこと、`validateRevisionResponse` が `null` を返したときに再生成 → 失敗時 `LLMExtractionFailedError` になること。
- 既存 `InferTraitsUseCase`／`buildHypotheses` のテストが `source` フィールド追加後も green であること（デフォルト `'model'` 補完を確認）。

### 11. 引き継ぎ資料

`docs/next_connection/index/active/llm/2026-06-25_hypothesis-mirror-verification.md` を新規作成し、目次.md に追記。記録する内容: artifact 本文（spec doc）が消失している経緯、フェーズ2（矛盾プローブ）の未実装、`/persona` の数値%表示と新コンポーネントの非数値表示が並存している状態（将来どちらかに統一する判断が必要）。

## 変更ファイル一覧

| Path | 種別 |
|---|---|
| `supabase/migrations/041_trait_hypothesis_verification.sql` | N |
| `src/core/domains/trait/TraitHypothesis.ts` | E |
| `src/core/domains/trait/ITraitHypothesisRepository.ts` | E |
| `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts` | E |
| `src/application/llm/structuralMirrorPrompt.ts` | N |
| `src/application/llm/policies/LLMResponseValidator.ts` | E |
| `src/application/usecases/VerifyTraitHypothesisUseCase.ts` | N |
| `src/container/createUseCases.ts` | E |
| `app/api/hypotheses/route.ts` | N |
| `app/api/hypotheses/[traitKey]/history/route.ts` | N |
| `app/api/hypotheses/[id]/verify/route.ts` | N |
| `lib/useHypothesisMirror.ts` | N |
| `components/HypothesisMirror.tsx` + `.module.css` | N |
| `app/persona/page.tsx` | E（1行追加） |
| `docs/next_connection/目次.md` + 新規 active ファイル | E/N |

## 検証

1. `supabase db push` で 041 が適用される（`add column if not exists` で冪等）。
2. `npm run lint`（boundaries チェック）でレイヤ越境ゼロ。
3. `npm run build` 型エラーゼロ — 特に `TraitHypothesisRecord` に必須フィールド `source` を追加するため、既存の record リテラルを作っている箇所（`InferTraitsUseCase.buildHypotheses` 等）がコンパイルエラーにならないか確認し、必要なら `source` を任意 (`source?: ...`) にするか、`buildHypotheses` 側で明示的に `'model'` を渡す。
4. `npm test` で新規 unit が green、既存回帰なし。
5. `npm run dev` で `/persona` を開き: 生きている仮説カードが文章で出る（%が見えない）→「違う・精緻化」で訂正 → DB (`select * from trait_hypothesis_history where trait_key=? order by created_at desc`) で新行 (`source='user_revision'`, `revised_from_id` 結線) と旧行 `status='revised'` を確認 →「近い」で `verified_at` が追記され本文不変を確認 →「今は答えにくい」で `status='needs_review'` を確認。
6. ブラウザ DevTools Network タブで `api.anthropic.com` への直接リクエストが無いこと（全てサーバ側 `/api/hypotheses/*` 経由）。
7. 既存 `POST /api/logs` → 解析ジョブ → `InferTraitsUseCase` の回帰がないこと（`source` 列追加後も既存 insert が通ること）。

## NON-GOALS

- `InferTraitsUseCase`/`DetectPatternsUseCase`/`AnalysisJobConsumer`/`AnalysisContextService` の挙動変更。
- `big_five_scores`/`big_five_facets`/`identity_status`/`attachment_profile` への書き込み。
- 既存 `markRevised`/`markStatusByEvidenceIds` の削除や変更。
- ブラウザ側からの LLM 直接呼び出し。
- 矛盾を突く「鏡の問い」生成・`probe/answer` ループ（フェーズ2）。
- `reject`（仮説の完全却下）アクション（今回は confirm/revise/hold の3つのみ）。
- `/persona` 既存セクションの数値%表示の削除・置き換え。
