# LLM 応答サンプル集

このファイルは `patternDetectionPrompt.ts` および `traitInferencePrompt.ts` に対する模擬的な LLM 応答の事例を示します。実際の LLM 出力は多様ですが、システムで期待される構造に合わせた代表例を示します。

---

## 1. パターン検出 — 正常ケース（2割当, psychologyAnalysisあり）

期待される JSON（LLM が返す想定）:

```json
{
  "assignments": [
    {
      "clusterType": "procrastination",
      "label": "先延ばし",
      "description": "タスク開始を避け、別の行動で時間を消費しているため",
      "confidence": 0.82,
      "reasoning": "ユーザーは勉強を始める代わりにSNSを長時間見ていると述べ、結果的に期限を逸している。"
    },
    {
      "clusterType": "perfectionism",
      "label": "完璧主義",
      "description": "失敗を恐れて作業開始をためらう傾向が見られる",
      "confidence": 0.65,
      "reasoning": "『完璧にできなければやらない』という表現が複数回あり、行動の先延ばしと合致。"
    }
  ],
  "psychologyAnalysis": {
    "narrativeSequence": "stable",
    "agencyScore": 2,
    "communionScore": 3,
    "attributionLocus": "internal",
    "attributionStability": "unstable",
    "attributionControllability": "controllable",
    "cognitiveDistortions": ["all_or_nothing", "catastrophizing"]
  }
}
```

- この出力は `LLMResponseValidator` を通し、両方の assignment が confidence >= 0.6 のため採用されます。
- `experience_cluster_map.reasoning` に各 `reasoning` が保存され、psychologyAnalysis は `experiences` の心理フィールドに格納されます。

---

## 2. パターン検出 — クラスタ該当なし

```json
{
  "assignments": [],
  "psychologyAnalysis": {
    "narrativeSequence": "unknown",
    "agencyScore": 3,
    "communionScore": 2,
    "attributionLocus": "external",
    "attributionStability": "unstable",
    "attributionControllability": "uncontrollable",
    "cognitiveDistortions": []
  }
}
```

- `assignments` が空のためクラスタ化は行われませんが、psychologyAnalysis は保存されます。

---

## 3. パターン検出 — 低信頼度応答（フィルタされる例）

LLM が次のように返した場合、confidence が両方とも 0.5 なので `LLMResponseValidator` により assignments はフィルタされ、保存されません。

```json
{
  "assignments": [
    { "clusterType": "procrastination", "label": "先延ばし", "description": "...", "confidence": 0.5, "reasoning": "..." }
  ],
  "psychologyAnalysis": null
}
```

---

## 4. パターン検出 — 無効／非 JSON 応答（バリデーション落ち）

例: LLM が自然文で返したケース

```
ユーザーの説明から判断すると、先延ばしの傾向がありそうです...（中略）
```

- この場合 `LLMResponseValidator.validatePatternResponse` が JSON.parse に失敗し null を返します。運用では raw 応答をデバッグログに残すことを推奨します。

---

## 5. 特性推論 — 正常ケース（Big Five を返す）

```json
{
  "bigFive": {
    "openness": 0.62,
    "conscientiousness": 0.38,
    "extraversion": 0.27,
    "agreeableness": 0.71,
    "neuroticism": 0.45,
    "confidence": 0.68
  },
  "facets": [
    { "domain": "openness", "facetName": "intellectual_curiosity", "score": 0.7, "confidence": 0.6 }
  ],
  "attachmentHints": { "anxietyScore": 4.0, "avoidanceScore": 2.5 },
  "identityStatus": [
    { "domain": "career", "explorationScore": 0.4, "commitmentScore": 0.6 }
  ]
}
```

- `LLMResponseValidator.validateBigFiveResponse` が数値をクランプして受け入れ、`InferTraitsUseCase` はこれをレガシー traits に変換して `trait_hypothesis_history` に保存します。

---

## 6. 特性推論 — フォールバック（Big Five を返さない場合）

LLM が簡潔に traits マップを返す場合:

```json
{ "traits": { "introversion": 0.8, "discipline": 0.35, "curiosity": 0.55, "risk_tolerance": 0.3, "self_criticism": 0.6, "social_anxiety": 0.45 } }
```

- `LLMResponseValidator.validateTraitResponse` がこれを受け取り、`InferTraitsUseCase` はフォールバックとして `trait_hypothesis_history` に仮説を生成します。

---

## 7. 特性推論 — 無効出力（構造不一致）

- LLM が任意の文章や別形式の JSON を返した場合、バリデータは null を返し `InferTraitsUseCase` は fallback ロジック（`buildFallbackTraits`）を用いて仮説を生成します。\
- その際 `bigFive_scores.confidence` は低め（例: 0.1）に設定されます。

---

## 注記（運用上の推奨）
- 実際の LLM 応答は必ずしも期待通りの構造化 JSON を返さないため、raw 出力のログ保存（少なくとも解析用に）を推奨します。
- `confidence` のスケールは LLM により一貫性がない可能性があるため、UI 表示前に正規化ルール（閾値、ソース別キャリブレーション）を設けてください。

---

作成日: 2026-05-28
