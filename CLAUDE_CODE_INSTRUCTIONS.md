# YourselfLM ログ入力UI改修 — 実装指示書

## 背景（なぜこの改修が必要か）

実データ29件（user: 25df8157）を分析した結果、`trait_hypothesis` が全トレイトで
score/confidence/uncertainty = 0.5 を返している。原因は2層ある。

1. **コード層**: LLM応答のJSONパースが失敗してサイレントにフォールバック（既知・別途対応）
2. **データ層（本指示書の対象）**: そもそも入力データの構造がLLM分析に不適切

### 実データから判明したデータ品質の問題

- `trigger` / `outcome` / `emotion_level` が **全29件で空**
- `emotion` が自由テキストで表記揺れ激しい（例: 「不安、焦り、期待、悲しみ」「不安、あと二時間以内ま?」）
- `stress_level` が29件中17件レベル1に偏り（尺度の意味が伝わっていない）
- `action_result` が CONFRONTED 86%（25/29）に偏り（2値が粗すぎる）
- `description` と `goal` の役割が逆転しているケース多数（例: description=「レポート」, goal=「国語のレポートをしていた」）
- 所要時間・時間帯が `context` の自由テキストに埋もれている
- `narrative_sequence` / `agency_score` / `attribution_*` は psychology_analyzed_at が入った7件のみ

## 設計方針の転換

**ユーザーに15フィールドを埋めさせるのをやめる。**
日記テキスト1つを入力 → LLMが構造化抽出 → ユーザーが確認・修正、の2段階にする。

```
Stage 1: ユーザーが日記を書く/喋る（自由テキスト1フィールド）
  ↓
LLM-1: 構造化抽出（emotion, trigger, outcome, 時間帯, 所要時間を自動で埋める）
  ↓
ユーザーに「これで合ってる？」と確認（修正可能）
  ↓
保存（構造化済みデータ）
  ↓
Stage 2: 構造化済みデータでトレイト分析（既存のInferTraitsUseCase）
```

## UIフロー（3ステップ）

参照モック: `log_input_mockup.html`（同梱）

### Step 1: 日記入力
- テキストエリア1つ（プレースホルダで書き方の例を示す）
- 音声入力ボタン（Web Speech API or 文字起こしAPI → テキストエリアに反映 → 編集可）
- 「AIに読み取ってもらう」ボタン → LLM-1呼び出し

### Step 2: 抽出結果の確認
LLM-1が抽出した以下を表示し、ユーザーが修正できる:
- やったこと（description相当・1行）
- 場所・時間（context + 所要時間）
- 感情: チップ選択式（LLMが候補提示 → ユーザー選択） + 強度ドット1-5
- 結果: 4値ボタン `CONFRONTED_SUCCESS` / `CONFRONTED_FAILED` / `AVOIDED` / `PARTIAL`

### Step 3: trigger追加質問
- LLM-1が「triggerが読み取れなかった」と判断した場合のみ、1問だけ追加質問
- スキップ可能
- 「保存する」ボタン

## データモデルの変更

### 変更
- `emotion` (text) → `emotions` (構造化: `[{label: string, intensity: 1-5}]`)
- `action_result` の enum を 2値 → 4値に拡張
  - `CONFRONTED_SUCCESS` / `CONFRONTED_FAILED` / `AVOIDED` / `PARTIAL`
  - 既存データのマイグレーション: 現 `CONFRONTED` → `CONFRONTED_SUCCESS` に暫定変換

### 追加（構造化フィールド・LLMが自動抽出）
- `time_of_day` enum: `morning` / `afternoon` / `evening` / `night`
- `duration_minutes` integer (nullable)
- `trigger` は既存カラムを使う（今まで空だったものを埋める運用に）

### 入力ガイドの明示
- `stress_level` スライダーに各段階の説明を付ける
  - 「1=ほぼ平常心 / 3=集中が乱れる / 5=何もできない」

## LLM-1（構造化抽出）のプロンプト要件

### 入力
ユーザーの日記テキスト（自由形式）

### 出力（厳密なJSON、Qwen3-Swallow-8B対応）
```json
{
  "description": "1行の行為説明",
  "context": "場所や状況",
  "time_of_day": "morning|afternoon|evening|night",
  "duration_minutes": 120,
  "emotions": [
    {"label": "爽快", "intensity": 4},
    {"label": "達成感", "intensity": 3}
  ],
  "action_result": "CONFRONTED_SUCCESS|CONFRONTED_FAILED|AVOIDED|PARTIAL",
  "trigger": "読み取れた場合のみ、なければ null",
  "needs_trigger_question": true,
  "trigger_question": "triggerが読み取れない場合に聞く質問文"
}
```

### Qwen3-Swallow-8B向けの注意（重要）
- 小型ローカルモデルは JSON の前後に説明文をつけたり ```json フェンスで囲うことが多い
- パース側で「最初の `{` から最後の `}` まで」を抽出してからパースする防御を入れる
- システムプロンプトで「JSONのみ出力。説明文・マークダウン禁止」を強く指示
- few-shot例を1-2個入れる（入力日記 → 期待JSON のペア）

## 実装の優先順位

1. **最優先**: Step 1（日記入力1フィールド化）+ LLM-1プロンプト + JSON防御パース
2. 次: Step 2（抽出結果確認UI）+ emotions構造化 + action_result 4値化
3. その後: Step 3（trigger追加質問）+ time_of_day/duration抽出

## 検証方法

LLM-1の精度は別途Pythonスクリプトで検証する（LM Studio直叩き）。
実データ29件の日記テキストを入力 → 抽出JSONが妥当か目視確認 → プロンプト改善のループ。
本番APIに課金できないため当面ローカルLLM（Cloudflare Tunnel経由）で進める。
