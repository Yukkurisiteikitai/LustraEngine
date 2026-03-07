import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { PersonaJson, TraitName } from '@/types';

const TRAIT_LABELS: Record<TraitName, string> = {
  introversion: '内向性',
  discipline: '自律性',
  curiosity: '好奇心',
  risk_tolerance: 'リスク許容度',
  self_criticism: '自己批判',
  social_anxiety: '社会不安',
};

const CLUSTER_LABELS: Record<string, string> = {
  procrastination: '先延ばし傾向',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

const DOMAIN_LABELS: Record<string, string> = {
  WORK: '仕事',
  RELATIONSHIP: '人間関係',
  HEALTH: '健康',
  MONEY: 'お金',
  SELF: '自己',
};

function describeScore(score: number): string {
  if (score >= 0.8) return 'とても高い';
  if (score >= 0.6) return '高め';
  if (score >= 0.4) return '普通';
  if (score >= 0.2) return '低め';
  return 'とても低い';
}

export function buildChatSystemPrompt(
  persona: PersonaJson,
  experiences: ExperienceData[],
): string {
  const { traits, dominantClusters, domainBreakdown } = persona;

  const traitLines = (Object.entries(traits) as [TraitName, number][])
    .map(
      ([name, score]) =>
        `- ${TRAIT_LABELS[name]}: ${describeScore(score)}（${Math.round(score * 100)}点）`,
    )
    .join('\n');

  const clusterLines =
    dominantClusters.length > 0
      ? dominantClusters
          .map((c) => `- ${CLUSTER_LABELS[c.type] ?? c.type}（${c.detectedCount}回検出）`)
          .join('\n')
      : '- 検出されたパターンはありません';

  const topDomains = Object.entries(domainBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([domain, count]) => `- ${DOMAIN_LABELS[domain] ?? domain}（${count}件）`)
    .join('\n');

  const recentLines =
    experiences.length > 0
      ? experiences
          .slice(0, 5)
          .map(
            (e) =>
              `- ${e.description.slice(0, 60)}（ストレス${e.stressLevel}/5、${e.actionResult === 'CONFRONTED' ? '向き合った' : '回避した'}）`,
          )
          .join('\n')
      : '- 最近の体験記録はありません';

  const styleGuidelines: string[] = [
    '- 常に日本語で返答してください',
    '- 自己理解を深める対話を心がけてください',
  ];
  if ((traits.self_criticism ?? 0) >= 0.6) {
    styleGuidelines.push(
      '- self_criticismが高いため、批判的・否定的な表現を避け、受容的なトーンで話してください',
    );
  }
  if ((traits.social_anxiety ?? 0) >= 0.6) {
    styleGuidelines.push(
      '- social_anxietyが高いため、穏やかで安心感のある表現を使ってください',
    );
  }
  if ((traits.introversion ?? 0) >= 0.6) {
    styleGuidelines.push('- introvertionが高いため、静かで思慮深いトーンを保ってください');
  }
  if ((traits.curiosity ?? 0) >= 0.6) {
    styleGuidelines.push(
      '- curiosityが高いため、分析的・探索的な視点で関わってください',
    );
  }

  return `あなたは「Lustra」のパーソナルアシスタントです。ユーザーの自己理解と内省をサポートする対話を行います。

## ユーザーのパーソナリティトレイト
${traitLines}

## 主要な行動パターン
${clusterLines}

## 最も多い活動領域（上位2件）
${topDomains || '- データなし'}

## 最近の体験（直近5件）
${recentLines}

## 対話スタイルのガイドライン
${styleGuidelines.join('\n')}`;
}
