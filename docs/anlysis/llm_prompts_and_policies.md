# LLM プロンプト・ポリシーと応答検証 — 調査報告

このドキュメントは YourselfLM の LLM 関連プロンプト、出力制御ロジック、分析ワークフロー、DB スキーマへの保存手順を厳密に整理したものです。

参照実装主要ファイル:

- `src/application/llm/patternDetectionPrompt.ts`
- `src/application/llm/traitInferencePrompt.ts`
- `src/application/llm/policies/LLMResponseValidator.ts`
- `src/application/llm/policies/LLMRetryPolicy.ts`
- `src/application/usecases/DetectPatternsUseCase.ts`
- `src/application/usecases/InferTraitsUseCase.ts`
- `src/infrastructure/repositories/SupabasePsychologyRepository.ts`
- `src/infrastructure/jobs/AnalysisJobConsumer.ts`
- `src/application/workflows/ProcessExperienceWorkflow.ts`
- マイグレーション: `supabase/migrations/*`（特に `002_cognition_layer.sql`, `016_psychology_field.sql`, `029_analysis_jobs.sql`, `015_add_big_five.sql`, `031_trait_hypothesis_history.sql`）

---

## 1) LLM プロンプト・ポリシー調査（まとめ）

### A. 現在の分析カテゴリ
- パターン検出（episode cluster）: `procrastination`, `social_avoidance`, `authority_anxiety`, `perfectionism`（拡張可能）。実装プロンプト: `patternDetectionPrompt.ts`。
- 心理学的分析（experience単位）: ナラティブ分析（`redemption`/`contamination`/`stable`/`unknown`）、`agencyScore`、`communionScore`、帰属スタイル（`attribution_*`）、認知の歪み（Beck系の列挙） — `patternDetectionPrompt` の psychologyAnalysis 部分。
- 特性推論（Individual trait / Big Five）: Big Five 因子（`openness` 等）、ファセット、attachmentHints、identityStatus。実装プロンプト: `traitInferencePrompt.ts`。
- TraitHypothesis（履歴としての仮説）: `trait_hypothesis_history` に append される「仮説」レコード（score, confidence, uncertainty, evidence_ids, source_pattern_ids）。

### B. 入力データ
- 主に `experiences` テーブルのエントリ（`description`, `emotion`, `goal`, `action`, `context`, `stress_level`, `action_result` など）。`AnalysisContextService` が recentLogs/unprocessedLogs を組成して LLM に渡す。
- 既検出のパターン（`episode_clusters`）や現行の `TraitHypothesis`（activeHypotheses）を入力として渡す（`buildTraitUserMessage`）。
- ジョブモードや履歴サマリ（3ヶ月サマリ等）も作成コンテキストに含まれる（`AnalysisContextService.buildContext`）。

### C. 出力形式（プロンプト仕様とバリデータ）
- パターン検出: JSON オブジェクト
  - `assignments`: 配列 (最大2件) に `clusterType`, `label`, `description`, `confidence` (数値), `reasoning` (説明) を含める。
  - `psychologyAnalysis`: `narrativeSequence`, `agencyScore`, `communionScore`, `attributionLocus`, `attributionStability`, `attributionControllability`, `cognitiveDistortions`。
  - `patternDetectionPrompt` は "Respond ONLY with valid JSON in this exact format" を要求。
- 特性推論: JSON（`TRAIT_SYSTEM_PROMPT` の形式）
  - 理想: `bigFive` オブジェクト（各因子 0–1 と `confidence`）、`facets` 配列、`attachmentHints`、`identityStatus` 配列。
  - フォールバック: LLM が Big Five を返さない場合、`traits` の単純なマッピングを受け取ることも許容（`LLMResponseValidator.validateTraitResponse`）。
- バリデーション: `LLMResponseValidator` が JSON パース、型・範囲チェック（スコア範囲 clamp、認知歪み集合フィルタ等）、パターンでは confidence >= 0.6 のフィルタを適用する。

### D. 禁止・制約されている推論
- プロンプト内部の明示的な「禁止」は少ないが、`traitInferencePrompt` は "ラベル付けではなく仮説" と明記している（診断ではないフレーミング）。
- `LLMResponseValidator` により数値範囲や列挙値以外は破棄されるため、構造化でない出力は無視される（NULL扱い）。
- `patternDetectionPrompt` は最大 2 割当、confidence threshold を満たすもののみ採用する実装（検出側で 0.6 未満は除外）。

### E. 診断化・人格断定リスク
- リスク高: Big Five 等をユーザーに "性格の事実" として提示すると誤解やスティグマにつながる可能性あり。実装では `trait_hypothesis_history` に "仮説" として保存し `confidence`/`uncertainty` を明示しているが、UI 層での言い方次第で診断化される危険がある。
- 誤解リスク: `attribution_locus='external'` や `agreeableness` の高低などは文化依存で誤判定されやすいため、プロンプトで文化補正注意が入っている。

### F. 根拠 Episode との接続有無
- あり: `classify_experience_atomic` RPC により `experience_cluster_map` に `confidence` と `reasoning` を記録して、クラスターとエピソード（experience）を明示的に結びつける。
- trait 仮説も `trait_hypothesis_history.evidence_ids` に experience ID リスト、`source_pattern_ids` に pattern ID を保存し、出力がどのログに基づくかを保持する。

### G. confidence / uncertainty / evidence の扱い
- パターン: LLM の `confidence` 値は出力をそのまま `experience_cluster_map.confidence` に保存（ただし LLMResponseValidator で >=0.6 をフィルタ）
- 心理分析: experience 側に `psychology_analyzed_at` タイムスタンプを保存。個別指標（agency/communion）は DB に数値（0–5）のまま格納される。
- 特性: `trait_hypothesis_history` に `score`, `confidence`, `uncertainty` を保存。`confidence` は BigFive レスポンスの `confidence` を参照する場合がある（`InferTraitsUseCase` で `bigFiveResult?.bigFive.confidence` を使う）。
- エビデンス数: `big_five_scores.evidence_count` や `big_five_facets.confidence` 等で追跡可能（`SupabasePsychologyRepository` 経由）。

---

## 2) ユースケース・ワークフロー調査（実行フロー）

主要フロー（ログ登録→非同期分析）:

1. ユーザーがログ投稿: `LogExperienceUseCase.execute` が `experiences` に保存（同期）。
   - この段階では `processed_at` は NULL（未分析）。
2. ジョブ作成: バッチ／スケジューラが `analysis_jobs` を作成（`trigger` は `daily|manual` 等）。Cloudflare キュー / InMemoryQueue にメッセージを送る設計あり（`ProcessExperienceWorkflow` + `InMemoryQueue`）。
3. ジョブ消費: ワーカーが `AnalysisJobConsumer.process` を実行。
   - `AnalysisContextService.buildContext` で recentLogs, unprocessedLogs, previousPatterns, activeHypotheses を収集。
   - `createLlm(userId)` でユーザーに紐づく LLM（APIキー等）を構築。
4. DetectPatterns 実行: `DetectPatternsUseCase.execute` を呼び、各 experience を LLM に投げる (`PATTERN_SYSTEM_PROMPT` + userMessage)。
   - LLM の応答を `LLMResponseValidator.validatePatternResponse` で解析。
   - `psychologyAnalysis` があれば `SupabasePsychologyRepository.updateExperiencePsychologyAnalysis` を呼び `experiences` の心理分析カラム群を更新。
   - `assignments` があれば `classify_experience_atomic` RPC を経て `episode_clusters` / `experience_cluster_map` に反映（atomic）。
5. InferTraits 実行: モードによっては `InferTraitsUseCase.execute` を呼ぶ。
   - `TRAIT_SYSTEM_PROMPT` と `buildTraitUserMessage` を LLM に投げ、Big Five を期待。
   - `LLMResponseValidator.validateBigFiveResponse` を使って構造化を得る。得られればレガシー traits に変換し、`trait_hypothesis_history` に append する。
6. ジョブ完了: `analysis_jobs` の `status` / `result` を更新。`processed_at` を experiences にセット（モードによる）。

同期 / 非同期の分岐:
- ログの保存は同期（APIリクエスト）。
- 分析は基本的に非同期バッチ（`analysis_jobs`, queue, worker）で実行。`DetectPatternsUseCase` には `dryRun` オプションがあり、`mode==='quick'` 時は DB 更新を抑止する。

どの時点で LLM 呼び出しか:
- `DetectPatternsUseCase` 内で各 experience ごとに `this.llm.generate(PATTERN_SYSTEM_PROMPT, userMessage, 800)` を呼ぶ。
- `InferTraitsUseCase` で `this.llm.generate(TRAIT_SYSTEM_PROMPT, userMessage, 1024)` を呼ぶ。

DB に保存される結果:
- experiences の心理タグ群（`narrative_sequence`, `agency_score`, `communion_score`, `attribution_*`, `cognitive_distortions`, `psychology_analyzed_at`）
- episode_clusters（アップサート）および experience_cluster_map（confidence、reasoning）
- trait_hypothesis_history（仮説レコード、evidence_ids、confidence、uncertainty）
- analysis_jobs.result に検出数やサマリ
- (場合によって) big_five_scores / facets / attachment_profile への upsert（`SupabasePsychologyRepository` を通じて呼び出される場合）

ユーザー修正可能性:
- 現状コードでは DB に書き込まれる `experience_cluster_map.reasoning` や `trait_hypothesis_history.hypothesis_text` は保存されるが、UI 経由でユーザーが直接修正する機能はコードベース内に明示されていない（フロント実装想定）。
- `trait_hypothesis_history` は append-only 履歴で、`status` によって `revised`/`rejected` も可能だが、ユーザー操作での `rejected` 変更フローは見つからなかった（API 層での実装が必要）。

---

## 3) DB スキーマ（分析に関係するテーブル・重要カラム）
（抜粋・要点）

- `experiences` (`supabase/migrations/001_initial.sql`, `016_psychology_field.sql`, `028_add_processed_at.sql`)
  - `description, emotion, goal, action, context, stress_level, action_result`
  - 心理分析フィールド: `narrative_sequence`, `agency_score`, `communion_score`, `attribution_locus`, `attribution_stability`, `attribution_controllability`, `cognitive_distortions` (TEXT[])
  - 管理: `psychology_analyzed_at`, `processed_at`, `soft_deleted_at`（参照コード条件あり）

- `episode_clusters` (`002_cognition_layer.sql`)
  - `cluster_type`, `label`, `description`, `strength`, `detected_count`, `last_detected_at`
  - `theory_category`, `theory_source`（後続拡張移行済み）

- `experience_cluster_map` (`002_cognition_layer.sql` / `004_classify_atomic.sql`)
  - `experience_id`, `cluster_id`, `confidence` (REAL), `reasoning` (TEXT)

- `trait_hypothesis_history` (`031_trait_hypothesis_history.sql`)
  - `trait_key`, `hypothesis_label`, `hypothesis_text`, `score`, `confidence`, `uncertainty`, `evidence_ids` (JSONB), `source_pattern_ids` (JSONB), `model_name`, `prompt_version`, `status`

- `big_five_scores`, `big_five_facets` (`015_add_big_five.sql`)
  - Big Five スコア（0–1）、`confidence`、`evidence_count`

- `analysis_jobs` (`029_analysis_jobs.sql`)
  - ジョブの状態遷移（`status`, `mode`, `trigger`, `result`, `started_at`, `completed_at`）

---

## 4) 出力形式（表）

| 分析名 | 実装済み/未実装/可能 | 入力 | 出力 | 保存先 | 根拠接続 | 信頼度 | ユーザー修正 | リスク | 改善案 |
|---|---:|---|---|---|---:|---|---:|---|---|
| パターン検出 (episode cluster) | 実装済み | `experiences`（description 等） | `assignments` JSON (clusterType, label, description, confidence, reasoning) | `episode_clusters`, `experience_cluster_map` | はい（experience_id を記録） | LLM出力の `confidence`（>=0.6 を採用） | UI 実装必要（未実装） | クラスタ化の誤判定による自己認識の歪み | ユーザー確認 UI、ヒューマンレビュー閾値、詳細 Reasoning の保存 |
| 心理学的分析（experience 単位） | 実装済み | experience テキスト | `psychologyAnalysis` JSON（narrative, agency, communion, attribution, cognitiveDistortions） | `experiences` の心理フィールド | 部分的（psychologyAnalysis を experiences に保存） | 指標は直接保存（スコア範囲 enforced） | UI 表示・編集未実装 | 誤解・診断化、文化バイアス | 出力の自然言語説明＋根拠文スニペット保存、ユーザー修正フロー |
| Big Five / 特性推論 | 実装済み（LLM 呼出）/ 保存は実装が利用される箇所あり | recentLogs, clusters, activeHypotheses | `bigFive` JSON or `traits` map | `trait_hypothesis_history`（仮説として保存）、`big_five_scores` へ upsert 可能 | はい（evidence_ids に experience を保存） | BigFive.confidence を使用。fallback あり | UI で仮説承認フロー必要 | 診断化、WEIRDバイアス | 信頼度閾値運用、文化補正パラメータの明示、ユーザー向けの "仮説/確信度" 表示 |
| trait_hypothesis_history (仮説) | 実装済み | traitScores / evidenceIds | 仮説レコード（score, confidence, uncertainty, evidence_ids） | `trait_hypothesis_history` | はい（evidence_ids） | 保存時に `confidence` を必須 | 履歴は append-only、ユーザーによる reject/revise API が必要 | "性格" 固定化のリスク | ユーザーが仮説をマークできる UI、説明責任ログ |

(注) 上表は現行コードの挙動と DB スキーマに基づく概観です。

---

## 5) 結論（推奨含む）

### A. 現在 YourselfLM が持っている分析
- エピソード単位の行動パターン分類（最大2件）及びその理由・信頼度（`experience_cluster_map` 保存）。
- エピソード単位の心理学的指標（ナラティブ、agency/communion、帰属、認知歪み）を抽出・保存。
- 特性推論（Big Five 形式または直接 traits）から仮説を生成し、`trait_hypothesis_history` に保管。
- ジョブベースの非同期ワークフローで処理（`analysis_jobs` + queue/worker）。

### B. 現在のコードから追加可能な分析（低工数）
- Big Five 結果を `big_five_scores` に自動 upsert（`InferTraitsUseCase` に `psychologyRepo.upsertBigFiveScore` を呼ぶ実装追加）。
- `psychology` の根拠テキストスニペット（LLM の reasoning の抜粋）を `experience_cluster_map.reasoning` 以外に別列で保存。
- 認知歪みの確度（頻度ベース）集計ダッシュボード（`experience` の cognitive_distortions を集約）。

### C. 追加すべき分析（価値/安全性の観点）
- 時系列トレンド解析（3ヶ月 summary を用いたストレス/パターン変化の検出）を自動化し、UI で視覚化。
- アタッチメントスタイル推定の自動 upsert（既に `attachmentHints` 用の schema があるため実装しやすい）。
- 根拠付き "説明文" の生成（ユーザー向け説明: なぜこの仮説が出たのか短い自然文＋エビデンス ID を添える）。

### D. 追加すべきでない分析（避けるべき）
- 医学的・精神医学的診断（DSM/V code 等）の自動判定と保存。臨床診断は専門家の評価を要するため、サービス上で自動化してはいけない。
- 法的影響のあるラベリング（危険行為の予測・犯罪性の推定等）。

### E. yourself 通信前に固めるべき要件（必須）
- ユーザー同意（opt-in）と可視化: 分析が行われること、保存されるデータ（experience、仮説、confidence）を明示・同意させる。UI の同意履歴を保存。
- 表示ガイドライン: 仮説は確定事実ではないことを明示し、`confidence`/`uncertainty` を見せる。決定的な言い回しを避けるテンプレートを用いる。
- 編集/異議申し立てフロー: ユーザーが誤ったクラスタ/仮説を修正・拒否できる API と UI（`trait_hypothesis_history.status` を更新するエンドポイント）。
- プライバシー・保持ポリシー: `evidence_ids` に紐づくログの保持期間、エクスポート・削除ルールを規定。
- 安全ガード: 機械的な自動削除（危険閾値）、人間によるレビュー・フィードバックループ、LLM の低信頼度応答を自動破棄する閾値設定。

---

## 付録: 追加の技術的観察
- `LLMResponseValidator` による構造化チェックは堅牢だが、LLM が "構造化 JSON 以外" を返すケースでは結果が破棄されるため、より寛容なパーシング／デバッグログ（raw 保存）を検討する価値あり。
- `LLMRetryPolicy` は指数バックオフで最大試行3回。レート制限時のロギングは `ClaudeAdapter` 側で詳細に記録しているため、運用時に監視メトリクスを作ると良い。
- provenance（出力→根拠テキストスニペット→experienceID）の連結は既存スキーマで十分サポートされている。UI 側がこれを活用すれば信頼性向上に寄与する。

---

作業完了: このドキュメントは `docs/anlysis/llm_prompts_and_policies.md` に保存しました。次に「UI 表示文言案」「ユーザー同意フロー設計」「特定出力のサンプル抽出（LLM の実際の応答例）」のいずれを作成しますか？
