# YourselfLM 分析・記録システム レポート

## 1. 結論

このシステムで「最終的に記録されるもの」は、主に次の 6 系統です。

1. ユーザーが入力した経験ログ本体
2. 経験ログに対する心理学的な構造化分析
3. 経験ログのパターンクラスタ分類
4. Trait 仮説の履歴
5. 分析ジョブの実行状態と集計結果
6. 条件付きで保存されるチャット履歴とトークン利用記録

逆に、「分析の途中で生成されるが、最終保存先には残らないもの」も明確です。

- LLM の生テキスト応答
- プロンプト本文
- 解析時の一時コンテキスト
- 再試行の中間ログ
- キュー配送メッセージ
- 一部の API レスポンス用のデバッグ値

つまり本システムは、LLM の出力そのものを丸ごと保存する設計ではなく、**検証済み・正規化済み・用途別に分割された結果だけを永続化する**設計です。

---

## 2. 永続化されるもの

### 2.1 `experiences` に保存されるもの

ユーザーの経験ログの中心は `experiences` テーブルです。`POST /api/logs` で入力された障害ログは、まずここに保存されます。

保存される主な値:

- `description`
- `stress_level`
- `action_result`
- `domain_id`
- `goal`
- `action`
- `emotion`
- `emotions`
- `context`
- `trigger`
- `time_of_day`
- `duration_minutes`
- `source`
- `visibility`
- `report_difficulty`
- `careful`
- `action_memo`
- `logged_at`

後から分析で追記される値:

- `narrative_sequence`
- `agency_score`
- `communion_score`
- `attribution_locus`
- `attribution_stability`
- `attribution_controllability`
- `cognitive_distortions`
- `disclosure_difficulty`
- `psychology_analyzed_at`
- `processed_at`

補足:

- `visibility = 'analysis_allowed'` のものだけが分析対象です。
- `soft_deleted_at` が入ったものは分析対象から外れます。
- `processed_at` は「分析済み」の印であり、未処理ログの抽出条件にも使われます。

### 2.2 `episode_clusters` と `experience_cluster_map`

パターン検出の結果は、2 段階で保存されます。

`episode_clusters`:

- `cluster_type`
- `label`
- `description`
- `strength`
- `detected_count`
- `last_detected_at`
- `created_at`
- `updated_at`

`experience_cluster_map`:

- `experience_id`
- `cluster_id`
- `confidence`
- `reasoning`
- `created_at`

意味:

- `episode_clusters` は「ユーザー内で再利用されるパターン辞書」です。
- `experience_cluster_map` は「その経験がどのクラスタに対応したか」の紐付けです。
- `reasoning` は保存されますが、LLM の全文回答は保存しません。

### 2.3 `trait_hypothesis_history`

Trait 推論の最終保存先は `trait_hypothesis_history` です。これは append-only の履歴です。

保存される主な値:

- `trait_key`
- `hypothesis_label`
- `hypothesis_text`
- `score`
- `confidence`
- `uncertainty`
- `evidence_ids`
- `source_pattern_ids`
- `model_name`
- `model_version`
- `prompt_version`
- `status`
- `analysis_job_id`
- `created_at`

意味:

- ここには「確定した人格」ではなく、**ログに基づく仮説**が保存されます。
- `evidence_ids` により、どの経験ログを根拠にしたかが残ります。
- `source_pattern_ids` により、どのパターン群を前提にしたかが残ります。
- `status` により、revised / rejected / archived へ遷移可能です。

### 2.4 `analysis_jobs`

分析処理の実行状態は `analysis_jobs` に保存されます。

保存される主な値:

- `job_type`
- `trigger`
- `mode`
- `priority`
- `status`
- `idempotency_key`
- `target_from`
- `target_to`
- `result`
- `error`
- `created_at`
- `scheduled_at`
- `started_at`
- `completed_at`

ここでの `result` は、分類件数や推論件数などの集計情報です。  
LLM の全文出力や生レスポンスは入りません。

### 2.5 チャット履歴

チャット履歴は、ユーザー設定で保存が許可されている場合のみ永続化されます。

保存先:

- `threads`
- `pair_nodes`
- `messages`

保存される主な内容:

- スレッドタイトル
- ユーザーメッセージ
- アシスタント応答
- `token_count`
- `model_id`
- `unit_price`

制約:

- `allowChatHistorySave` が無効なら保存されません。
- `ChatUseCase` 自体は応答を生成しても、永続化は別処理です。

### 2.6 運用メタデータ

次のような運用メタデータも永続化されます。

- `token_usage_windows`
- `llm_models`
- `llm_model_pricing`
- `v_user_llm_usage` の基礎となるメッセージ群

これは分析結果そのものではなく、利用制御と利用集計のための記録です。

### 2.7 キャッシュ

Cloudflare KV の `HTML_CACHE` には、Analytics ViewModel の軽量 JSON が保存されます。

これは HTML キャッシュではなく、表示用の派生データです。  
永続ストレージではありますが、分析結果の主保存先ではありません。

---

## 3. 永続化されないもの

### 3.1 LLM の生出力

次は保存されません。

- `DetectPatternsUseCase` の raw LLM 応答全文
- `InferTraitsUseCase` の raw LLM 応答全文
- `ExtractStructuredDiaryUseCase` の `rawText`

特に `app/api/logs/extract/route.ts` は、構造化済みの値だけを返し、`rawText` はクライアントへ返しません。  
`rawText` は必要時のサーバーログ向けです。

### 3.2 プロンプトと一時コンテキスト

次は DB には残りません。

- system prompt
- user message の組み立て文字列
- `AnalysisContextService` が作る `recentLogs`
- `unprocessedLogs`
- `threeMonthSummary`
- `previousPatterns`
- `activeHypotheses`

これらは分析実行のための一時構造です。  
保存されるのは、そこから抽出された結果のみです。

### 3.3 再試行・ジョブ配送の中間情報

次も永続化対象ではありません。

- LLM retry の各試行
- queue の送受信メッセージ本体
- `waitUntil` 内の実行コンテキスト
- CAS に失敗したジョブの一時状態

ジョブは `analysis_jobs.status` に状態だけが残り、配送メッセージそのものは残しません。

### 3.4 現行分析フローで書き込まれていない心理学系テーブル

`big_five_scores`、`big_five_facets`、`attachment_profile`、`identity_status` はテーブルと Repository 実装が存在します。  
ただし、現行の `InferTraitsUseCase` はこれらに書き込んでいません。

したがって現時点では、

- 読み取り用の永続データとしては存在する
- しかし trait 推論の主保存先ではない

という扱いです。

### 3.5 画面・API の一時表示用データ

次は永続化されません。

- `AnalyticsDTO` の画面表示用合成値
- API レスポンスにだけ使う `fallback` 情報
- ログ画面の一時フィルタ結果
- 実行中の `waitUntil` で生成される再描画用データ

---

## 4. 分析フロー

### 4.1 ログ保存

1. `POST /api/logs` で経験ログが送信される
2. `LogExperienceUseCase` が `experiences` に保存する
3. Cloudflare 実行時は 202 を返して、保存処理を `waitUntil` へ逃がす
4. その後、Home/Dashboard 用の Analytics ViewModel が KV に再保存される

この時点では、まだ分析結果は確定していません。

### 4.2 分析ジョブ生成

分析は即時同期ではなく、ジョブベースです。

- 日次: `DailyAnalysisScheduler`
- 手動: `POST /api/analysis/jobs`

いずれも `analysis_jobs` を作成し、Cloudflare Queue に積みます。  
`analysis_enabled = false` のユーザーはスキップされます。

### 4.3 コンテキスト構築

`AnalysisJobConsumer` がジョブを受け取ると、`AnalysisContextService` が分析用の文脈を組み立てます。

取得するもの:

- 直近 1 週間のログ
- 未処理ログ
- 3 か月サマリ
- 既存の `episode_clusters`
- 既存の active trait hypotheses

モード差:

- `quick` は直近ログ中心
- `full_3months` と `daily` は未処理ログと 3 か月文脈を含む

### 4.4 パターン検出

`DetectPatternsUseCase` が LLM を呼び、次を出します。

- 0〜2 件のクラスタ割当
- 心理学的分析

保存:

- 心理学的分析は `experiences` に追記
- クラスタ割当は `classify_experience_atomic` RPC で `episode_clusters` と `experience_cluster_map` に保存

補足:

- `dryRun = true` の quick モードでは DB 更新を抑止する
- ただし LLM には問い合わせる
- `confidence < 0.6` のクラスタは採用されない

### 4.5 Trait 推論

`InferTraitsUseCase` が LLM から Big Five または代替 traits を推論します。

保存:

- `trait_hypothesis_history` に append

このとき保存されるのは、確率・不確実性・根拠 ID を持った仮説です。  
確定人格値ではありません。

### 4.6 完了処理

最後に `AnalysisJobConsumer` が以下を更新します。

- `processed_at`
- `analysis_jobs.status`
- `analysis_jobs.completed_at`
- `analysis_jobs.result`

失敗時は `analysis_jobs.status = failed` と `error` が残ります。  
LLM の生出力は残りません。

---

## 5. 判定の根拠ファイル

- `src/application/usecases/LogExperienceUseCase.ts`
- `src/application/usecases/DetectPatternsUseCase.ts`
- `src/application/usecases/InferTraitsUseCase.ts`
- `src/application/analysis/AnalysisContextService.ts`
- `src/infrastructure/jobs/AnalysisJobConsumer.ts`
- `src/infrastructure/repositories/SupabaseExperienceRepository.ts`
- `src/infrastructure/repositories/SupabasePsychologyRepository.ts`
- `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts`
- `src/application/usecases/ExportUserDataUseCase.ts`
- `src/application/usecases/ExtractStructuredDiaryUseCase.ts`
- `app/api/logs/route.ts`
- `app/api/logs/extract/route.ts`
- `app/api/chat/route.ts`
- `app/api/analysis/jobs/route.ts`
- `supabase/migrations/001_initial.sql`
- `supabase/migrations/002_cognition_layer.sql`
- `supabase/migrations/004_classify_atomic.sql`
- `supabase/migrations/015_add_big_five.sql`
- `supabase/migrations/016_psychology_field.sql`
- `supabase/migrations/028_add_processed_at.sql`
- `supabase/migrations/029_analysis_jobs.sql`
- `supabase/migrations/031_trait_hypothesis_history.sql`
- `supabase/migrations/039_experience_structured_extraction.sql`
