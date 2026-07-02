# YourselfLM ── 仮説検証層に「構造の鏡」をアタッチする（Claude Code 実装指示）

> このドキュメントは Claude Code に渡す実装指示です。リポジトリのルート（または `docs/`）に置き、Claude Code に「このスペックに従って実装して。まず §4 の順序どおり既存ファイルを読んでから着手して」と指示してください。視覚・インタラクションの参照実装は `structural-mirror-demo.jsx`（別途共有のデモ）です。

---

## 0. 一行で

`InferTraitsUseCase` が生成し `trait_hypothesis_history` に積まれた**仮説**を、ユーザが画面上で**検証・訂正**でき、訂正が append-only の改訂として書き戻される「構造の鏡」UI＋バックエンドを、既存の仮説検証フローに**アタッチ**する。既存の解析ジョブ・パイプラインは壊さない。

---

## 1. 前提とアンカー（外れていたら止めて確認すること）

- **アタッチ先は `trait_hypothesis_history`**。この表は append-only で、`status` が revised / rejected / archived に遷移できる（`supabase/migrations/031_trait_hypothesis_history.sql`）。デモの「訂正ループ」と「訂正の堆積」は、この append-only チェーン＋status遷移に 1:1 で対応する。**堆積ログを別テーブルで作らない。仮説履歴そのものが堆積。**
- スタック（既知の事実）：Next.js（App Router）/ TypeScript / Supabase / Cloudflare Workers・Queue・KV / クリーンアーキテクチャ（`usecases` / `repositories` / `infrastructure` / DTO）。
- **LLM 呼び出しは必ずサーバ側**。デモはブラウザから直接 Claude を叩いていたが、本番では禁止（資料6のプロンプト管理脆弱性、鍵管理、一貫性のため）。フロント → 自前 API → UseCase → 既存 LLM クライアント、の経路にする。
- **既存の LLM クライアントを再利用する**（`InferTraitsUseCase` が使っている LLM 呼び出し基盤）。新しい SDK ラッパーを発明しない。

---

## 2. ゴール

ユーザが、自分について立っている trait 仮説を「確定版」ではなく**仮説**として見て、違う所を潰せる。潰すと、非病理的な system prompt の下で LLM が仮説を組み替え、**新しい行を append（前の行は `revised` に遷移）** する。確信度・不確実性は population 規準のスコアとしてでなく定性的に出す。スキップは捨てずに「核かもしれない領域」として記録する。矛盾を撞く問いが常に画面に出ている（着火）。

---

## 3. 設計原則 → 既存アーキテクチャの対応表（実装の WHY）

この対応を崩さないこと。各ピースが何のためにあるかの根拠。

| デモの原則 | 既存アーキテクチャでの実体 | 実装方針 |
|---|---|---|
| 構造仮説（型・スコアでなく） | `trait_hypothesis_history.hypothesis_text` | スコアをラベル化して出さない。`hypothesis_text` を中立・構造の文として出す |
| 訂正ループ | `status: active→revised` ＋ 新規 append | 破壊的 UPDATE をしない。新しい行を insert し、旧行を `revised` に |
| 訂正の堆積（ユーザの側に積もる） | append-only の仮説履歴 | 別ログを作らず、履歴を時系列で見せる |
| 矛盾撞き | `source_pattern_ids` 経由で `episode_clusters` を参照 | パターン間／価値と行動の緊張から probe を生成 |
| スキップ＝核の信号 | 既存 `experiences.report_difficulty` の精神を踏襲 | 新規 `held_territories` に記録（捨てない） |
| 非病理の記述 | （新規）共有 prompt モジュール | §7 の system prompt を生成・検証の両方で使う |
| 確信度（規準比較しない） | `confidence` / `uncertainty` | 高/中/低＋不確実性で定性表示。`score` は内部保持のみ、画面に population 比較を出さない |
| 着火（外部圧） | フロントで probe を常時表示 | 空の入力欄を見せない |

---

## 4. 実装の順序（着手前に必ず読むファイル → 構築）

1. **先に読む**（規約を学ぶため。コードを書く前に）：
   - `supabase/migrations/031_trait_hypothesis_history.sql`（status の初期値・列の正確な型）
   - `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts`
   - `src/application/usecases/InferTraitsUseCase.ts`（LLM クライアントの呼び方・prompt_version の扱い）
   - `supabase/migrations/004_classify_atomic.sql`（atomic RPC のパターン。改訂の atomic 化に踏襲）
   - `app/api/analysis/jobs/route.ts` と `app/api/logs/route.ts`（App Router の route 規約・認証の取り方）
2. スキーマ移行（§5）
3. リポジトリ層メソッド（§6）
4. 共有 prompt モジュール（§7）
5. `VerifyTraitHypothesisUseCase`（§8）
6. API routes（§9）
7. フロントの `HypothesisMirror` コンポーネント（§10）
8. 配線・受け入れ基準の確認（§12）

---

## 5. スキーマ移行 `supabase/migrations/040_hypothesis_verification.sql`

`031` の実列を確認した上で、足りないものだけ足す。想定する追加：

```sql
-- 改訂の系譜と来歴
alter table trait_hypothesis_history
  add column if not exists revised_from_id uuid references trait_hypothesis_history(id),
  add column if not exists source text not null default 'model',      -- 'model' | 'user_revision' | 'user_confirm'
  add column if not exists user_correction text,                       -- ユーザの訂正本文（一次データ）
  add column if not exists verified_at timestamptz;                    -- confirm の追記（破壊なし）

-- スキップ＝核かもしれない領域（捨てずに昇格）
create table if not exists held_territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trait_key text,
  probe_text text not null,
  note text,
  created_at timestamptz not null default now()
);

-- 改訂を atomic に：新行 insert ＋ 旧行を 'revised' へ（004 の RPC パターンに倣う）
create or replace function revise_hypothesis_atomic(...)
returns trait_hypothesis_history as $$ ... $$ language plpgsql;
```

RLS/権限・user スコープは既存表の方針に合わせる。`gen_random_uuid()` 等は既存マイグレーションで使っている関数に合わせること。

---

## 6. リポジトリ層（`SupabaseTraitHypothesisRepository.ts`）

既存の命名・戻り型・エラーハンドリングに合わせて、以下を追加：

- `findLiveByUser(userId): TraitHypothesis[]` — 現在生きている仮説（status が revised/rejected/archived **でない**もの、trait_key ごとに最新）。「生きている status」の値は `031` の実値に従う。
- `findHistoryByTraitKey(userId, traitKey): TraitHypothesis[]` — append-only チェーン（新しい順）。堆積ビュー用。
- `revise(prevId, next): TraitHypothesis` — `revise_hypothesis_atomic` を呼ぶ。新行（`source='user_revision'`, `revised_from_id=prevId`, `user_correction`, `model_name/version`, `prompt_version`）を insert し、旧行を `revised` に。
- `confirm(id): void` — `verified_at = now()` を追記（破壊的変更なし）。
- `reject(id, reason?): void` — `status='rejected'`。
- `hold(userId, traitKey, probeText, note?): void` — `held_territories` に insert。

`score` 列は内部保持のみ。UI 表示には使わない（§3 参照）。

---

## 7. 共有 prompt モジュール `src/application/analysis/prompts/structuralMirror.ts`

非病理の声を**生成と検証で共通化**するための単一の真実。`VerifyTraitHypothesisUseCase` が使う。**強く推奨：`InferTraitsUseCase` もこの system prompt に寄せる**（任意。このタスクの必須ではないが、寄せないと生成側が病理ラベルを出し続ける）。

`STRUCTURAL_MIRROR_SYSTEM`（verbatim、そのまま定数にする）：

```
あなたは YourselfLM の「構造の鏡」。ユーザを心理学カテゴリに分類する診断器ではなく、ユーザが「どう動くか」の構造仮説を一緒に組み上げ、検証・改訂していく鏡である。

厳守事項:
1. 病理ラベルを貼らない。distortion / 認知の歪み / 低自尊心 / 抑うつ / 無力感 / アイデンティティ未確立 / foreclosure / contamination 等、健全・不健全の価値序列を含むラベルを出力しない。
2. 個人の欠陥としてでなく、構造・環境・仕様として中立に記述する。例:「持続力がない」→「次のタスクが見える限り走る型」、「過小評価」→「信頼できる外部の鏡が手元にない（環境）」。
3. すべては仮説であって確定診断ではない。ユーザに訂正されたら弁護・反論をせず、その訂正を一次データとして取り込み、仮説を組み替える。
4. 深さは矛盾から生む。問いを返すときは、診断でなく、ログ内の矛盾（表明された価値と行動の緊張など）を撞く問いの形にする。
5. 日本語に固有の自己卑下・謙遜・「仕方ない」型の受容・他者依存的な動機・本音/建前を、欠陥や症状と読まない。文化的に正常な自己呈示・適応として扱う。能動的受容と諦観的受容は文脈で区別する。
6. 確信度を population 規準と比較した数値スコアとして提示しない。定性的な確信度（高/中/低）と不確実性で扱う。
7. 出力は指定された JSON のみ。前置き・コードフェンス・説明文を一切付けない。
```

LLM 操作は 2 つ。サーバ側で JSON をパースする（コードフェンス除去 → 最初の `{` から最後の `}` を取り `JSON.parse`、try/catch）。

**(A) 仮説の改訂 `reviseHypothesis`**
- 入力に含める：現在の仮説（label, text, confidence）、他の生きている仮説の要約、ユーザの訂正本文。
- 出力 JSON：
```json
{"hypothesis_text":"更新後の本文(中立・構造・非病理)","confidence":"高|中|低","uncertainty":0.0,"note":"何を変えたか一言"}
```

**(B) 問いへの回答 `answerProbe`**（矛盾ループ。フェーズ2として後回し可）
- 入力に含める：生きている仮説の要約、提示中の probe、ユーザの答え。
- 出力 JSON：
```json
{"reply":"短い中立応答(2文以内)","node_update":{"trait_key":"...","hypothesis_label":"...","hypothesis_text":"...","confidence":"高|中|低"} または null,"next_probe":"次の矛盾を撞く問い"}
```

モデルは Sonnet 系（ニュアンス担当）を既定に。安定した system prompt は prompt caching に載せる。検証は対話的なので同期呼び出し（バッチにしない）。

---

## 8. UseCase 層 `src/application/usecases/VerifyTraitHypothesisUseCase.ts`

`InferTraitsUseCase` の構造に倣う。責務：

- `confirm(userId, hypothesisId)` → repo.confirm
- `revise(userId, hypothesisId, correctionText)` →
  1. repo で現在の仮説と他の生きている仮説を取得
  2. 既存 LLM クライアント＋`STRUCTURAL_MIRROR_SYSTEM`＋操作(A)で改訂テキストを得る
  3. `repo.revise(prevId, next)`（atomic、append-only、status 遷移）
  4. 改訂後の仮説を返す
- `reject(userId, hypothesisId, reason?)` → repo.reject
- `hold(userId, traitKey, probeText, note?)` → repo.hold（LLM 呼ばない）
- `answerProbe(userId, probe, answer)`（フェーズ2）→ 操作(B)。`node_update` があれば trait_key 一致で revise、無ければ新規仮説を append（`source='user_revision'`）。`next_probe` を返す。

`model_name` / `model_version` / `prompt_version` は改訂行に必ず記録（来歴）。Workers 上の非同期は既存方針（`waitUntil` 等）に合わせる。

---

## 9. API 契約（App Router、既存 route 規約・認証に合わせる）

すべて認証必須・user スコープ。LLM 呼び出しはこの層より内側（UseCase）でのみ起きる。

```
GET  /api/hypotheses
  → { hypotheses: [{ id, trait_key, hypothesis_label, hypothesis_text,
                     confidence, uncertainty, status, verified_at, created_at }] }

GET  /api/hypotheses/[traitKey]/history
  → { history: [{ id, hypothesis_text, status, source, user_correction, created_at }] }  // 新しい順

POST /api/hypotheses/[id]/verify
  body: { action: 'confirm' | 'revise' | 'reject' | 'hold', correction?: string, note?: string }
  → { hypothesis?: <更新後>, next_probe?: string }

POST /api/hypotheses/probe/answer          // フェーズ2
  body: { probe: string, answer: string }
  → { reply: string, node_update?: {...} | null, next_probe: string }
```

不正な action やバリデーション失敗は、既存 route のエラー形式に合わせて返す。

---

## 10. フロントエンド `HypothesisMirror`（参照：`structural-mirror-demo.jsx`）

デモの視覚・インタラクションをそのまま移植する。ただし**本番デルタ**：

- **ブラウザから Claude を直接叩かない**。`GET /api/hypotheses` でカードを描画、訂正は `POST /api/hypotheses/[id]/verify`（action='revise'）、堆積パネルは `GET /api/hypotheses/[traitKey]/history`、probe は `POST /api/hypotheses/probe/answer`。デモの `callClaude` / `SYSTEM` 定数はフロントに残さない。
- カード＝仮説（明朝、中立記述）。「近い」=confirm、「違う・精緻化」=revise、「今は答えにくい」=hold。
- 「いま鏡が持っている問い」を常時表示（着火）。`next_probe` を順に出す。初期 probe が無ければ、生きている仮説と `source_pattern_ids`→`episode_clusters` の緊張からサーバ側で 1 つ生成して返す。
- 「訂正の堆積」＝ history エンドポイントの append-only チェーン。
- インクが定着する更新アニメーションは 1 箇所だけ（デモの `inkIn`）。`prefers-reduced-motion` を尊重。確信度は高/中/低の定性表示のみ。

既存のコンポーネント規約・スタイル基盤・認証フックに合わせること（フロントの既存ファイルを読んでから書く）。

---

## 11. 制約・やってはいけないこと（NON-GOALS）

- **既存の解析ジョブ・パイプライン**（`DetectPatternsUseCase` / `InferTraitsUseCase` / `AnalysisJobConsumer` / `AnalysisContextService`）の挙動を変えない。例外：§7 の共有 prompt を `InferTraits` に寄せる（任意・推奨）だけは可。
- `big_five_scores` / `big_five_facets` / `identity_status` / `attachment_profile` に**書き込まない**。スコア化したプロファイルを復活させない。
- 仮説本文を**破壊的に UPDATE しない**。常に append ＋ status 遷移。
- **ブラウザから LLM を呼ばない**。system prompt・モデル選択はサーバ側のみ。
- population 規準の生スコアを UI に出さない（測定不変性が無い限り定性表示）。
- §7 の非病理要件は nice-to-have でなく**ハード要件**。
- Cloudflare Workers ランタイム制約を守る（未対応 Node API を使わない、fire-and-forget は `waitUntil`）。
- 新しい LLM SDK ラッパーや新しい DB クライアントを発明しない。既存基盤を再利用。

---

## 12. 受け入れ基準

- [ ] 生きている trait 仮説が、中立・構造の文として「仮説」表示で見える（型・病理ラベルでない）。
- [ ] 仮説を訂正すると、新しい行が append され、前の行が `revised` に、`revised_from_id` と `user_correction` が記録される（履歴チェーンが切れない）。
- [ ] 改訂テキストが §7 の system prompt に従い、病理ラベルを含まない（例の罠入力で「過小評価→低自尊心」等を出さない）。
- [ ] 堆積ビューが append-only チェーンを反映する。
- [ ] 「今は答えにくい」が `held_territories` に記録され、捨てられない。
- [ ] 矛盾を撞く probe が常に画面にある（空の入力欄を見せない）。
- [ ] LLM 呼び出しがブラウザから一切発生しない（ネットワークタブで確認）。
- [ ] 既存の解析フローが回帰なく動く。
- [ ] confirm が `verified_at` を追記し、reject が `status='rejected'` にする（破壊なし）。

---

## 補足：コスト

検証 1 回は数千トークン規模なので、安定 system prompt を prompt caching に載せれば実質 1 操作あたり 1 円未満。検証は対話的＝同期。夜間の自動生成（既存ジョブ側）でバッチ/キャッシュを使う方針は別途。
