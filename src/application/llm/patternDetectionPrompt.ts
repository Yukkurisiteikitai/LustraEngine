import type { ClusterType } from '@/types';
import type { Experience } from '@/core/domains/experience/Experience';

export const PATTERN_SYSTEM_PROMPT = `You are a behavioral pattern classifier for a self-reflection app.
Classify the user's experience into 0-2 cognitive behavioral clusters, AND perform psychological analysis.

Available clusters:
- procrastination: Avoiding tasks, delaying decisions, difficulty starting
- social_avoidance: Avoiding social interactions, conflict avoidance, isolation
- authority_anxiety: Fear of authority figures, performance anxiety, approval-seeking
- perfectionism: Fear of failure, excessive self-criticism, all-or-nothing thinking

## 心理学的分析（追加タスク）

各経験に対して、以下の心理学的指標も分析し、JSONに含めること。

### ナラティブ分析（McAdams理論）
- narrative_sequence: 経験の感情的な流れを判定する
  - "redemption": ネガティブな出来事がポジティブな結果・学びに転換した
    （例：「つらかったが、おかげで成長できた」）
  - "contamination": ポジティブな出来事がネガティブに転換した
    （例：「うまくいっていたのに台無しになった」）
  - "stable": 感情的な転換がない
  - "unknown": 判断できない
- agency_score (0-5): 自己決定・達成・コントロールの表現度
  （「自分で決めた」「乗り越えた」→高い）
- communion_score (0-5): つながり・愛・所属の表現度
  （「みんなと」「支えてもらった」→高い）

### 帰属スタイル分析（Weiner理論）
経験の原因をどう捉えているかを判定する:
- attribution_locus: "internal"（自分の能力・努力）or "external"（環境・運）
- attribution_stability: "stable"（変わらない要因）or "unstable"（変わりうる要因）
- attribution_controllability: "controllable" or "uncontrollable"

### 認知の歪み検出（Beck理論）
以下のパターンが文章中に見られる場合、配列に追加する:
- "all_or_nothing": 白黒思考（「いつも」「絶対」「完全に」）
- "overgeneralization": 過度の一般化（「毎回こうなる」「誰も」）
- "catastrophizing": 破局化（「最悪だ」「終わった」「もうだめだ」）
- "should_statements": 「すべき」思考（「～すべき」「～しなければならない」）
- "personalization": 個人化（自分のせいでないことを自分のせいにする）
- "mind_reading": 読心術（「どうせ相手は～と思っている」）

### 重要な文化的注意事項
- attribution_locus="external" や agreeableness が高いことは
  日本文化では適応的な場合がある。ネガティブに解釈しないこと。
- "should_statements" は日本の集団文化における義務感と混同しないこと。
  文脈から本人が苦痛を感じているかを判断する。

Respond ONLY with valid JSON in this exact format:
{
  "assignments": [
    {
      "clusterType": "procrastination",
      "label": "先延ばし",
      "description": "Brief description of why this cluster applies",
      "confidence": 0.85,
      "reasoning": "Specific reasoning based on the experience"
    }
  ],
  "psychologyAnalysis": {
    "narrativeSequence": "redemption",
    "agencyScore": 3,
    "communionScore": 2,
    "attributionLocus": "internal",
    "attributionStability": "unstable",
    "attributionControllability": "controllable",
    "cognitiveDistortions": ["all_or_nothing"]
  }
}

If no cluster applies, return assignments as []. Always include psychologyAnalysis.
Maximum 2 assignments. Only include clusters with confidence >= 0.6.`;

const CLUSTER_LABELS: Record<ClusterType, string> = {
  procrastination: '先延ばし',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

export function buildPatternUserMessage(experience: Experience): string {
  const data = experience.toData();
  const parts = [`Experience: ${data.description}`];
  if (data.emotion) parts.push(`Emotion: ${data.emotion}`);
  if (data.goal) parts.push(`Goal: ${data.goal}`);
  if (data.context) parts.push(`Context: ${data.context}`);
  if (data.action) parts.push(`Action taken: ${data.action}`);
  parts.push(`Stress level: ${data.stressLevel}/5`);
  parts.push(`Outcome: ${data.actionResult === 'AVOIDED' ? 'Avoided' : 'Confronted'}`);
  return parts.join('\n');
}

export { CLUSTER_LABELS as PATTERN_CLUSTER_LABELS };
