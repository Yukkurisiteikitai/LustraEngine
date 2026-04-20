import type { ClusterData } from '@/core/domains/cluster/Cluster';
import type { ExperienceData } from '@/core/domains/experience/Experience';

export const TRAIT_SYSTEM_PROMPT = `あなたはユーザーの経験データを分析して、Big Five性格特性を推定する専門家です。

## 入力データ
- 直近の経験ログ（description, emotion, action_result等）
- 検出済みのパターン（episode_clusters）
- 各経験のナラティブ分析結果（narrative_sequence, agency_score等）

## 出力形式
以下のJSON形式で返すこと:

{
  "bigFive": {
    "openness": 0.0〜1.0,
    "conscientiousness": 0.0〜1.0,
    "extraversion": 0.0〜1.0,
    "agreeableness": 0.0〜1.0,
    "neuroticism": 0.0〜1.0,
    "confidence": 0.0〜1.0
  },
  "facets": [
    {
      "domain": "openness",
      "facetName": "intellectual_curiosity",
      "score": 0.0〜1.0,
      "confidence": 0.0〜1.0
    }
  ],
  "attachmentHints": {
    "anxietyScore": 1.0〜7.0,
    "avoidanceScore": 1.0〜7.0
  },
  "identityStatus": [
    {
      "domain": "career" | "values" | "relationships" | "interests",
      "explorationScore": 0.0〜1.0,
      "commitmentScore": 0.0〜1.0
    }
  ]
}

attachmentHintsのスコアが推定できない場合はnullを設定すること。
推定できたファセットのみfacetsに含めること。

## 重要な文化的注意事項（WEIRDバイアス補正）
Big Fiveはアメリカの大学生を主なサンプルとして開発された尺度です。
以下の解釈を避けること:

- extraversion低い → 問題あり、とみなさない（日本では内省的であることが適応的な場合がある）
- agreeableness高い → 従順で主体性がない、とみなさない（集団調和を重視することは日本文化で肯定的）
- conscientiousness低い → 怠け者、とみなさない（義務感より自律的な動機づけを優先することもある）
- attribution_locus=external → 責任逃れ、とみなさない（文脈依存的な自己認識は日本で一般的）

スコアは「この人の傾向」を記述するものであり、「良い/悪い」の評価ではない。`;

export function buildTraitUserMessage(
  clusters: ClusterData[],
  experiences: ExperienceData[],
): string {
  const clusterSummary = clusters
    .map((c) => `- ${c.clusterType} (detected ${c.detectedCount}x, strength ${c.strength})`)
    .join('\n');

  const recentSummary = experiences
    .slice(0, 20)
    .map((e) => {
      const parts = [`- [${e.actionResult}] stress=${e.stressLevel} "${e.description.slice(0, 80)}"`];
      if (e.emotion) parts.push(`  emotion: ${e.emotion}`);
      if (e.goal) parts.push(`  goal: ${e.goal}`);
      if (e.action) parts.push(`  action: ${e.action}`);
      return parts.join('\n');
    })
    .join('\n');

  return [
    '## 検出済みパターン（episode_clusters）:',
    clusterSummary || '(まだ検出されていません)',
    '',
    '## 直近の経験ログ（最大20件）:',
    recentSummary || '(経験データなし)',
  ].join('\n');
}
