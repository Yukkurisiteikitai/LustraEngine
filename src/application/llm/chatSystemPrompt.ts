import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { PersonaJson, TraitName } from '@/types';
import type {
  BigFiveScore,
  AttachmentProfile,
  AttachmentStyle,
  IdentityStatusRecord,
  IdentityStatus,
  IdentityDomain,
} from '@/core/entities/PsychologyProfile';

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

const IDENTITY_DOMAIN_LABELS: Record<IdentityDomain, string> = {
  career: 'キャリア',
  values: '価値観',
  relationships: '人間関係',
  interests: '興味・関心',
};

function describeScore(score: number): string {
  if (score >= 0.8) return 'とても高い';
  if (score >= 0.6) return '高め';
  if (score >= 0.4) return '普通';
  if (score >= 0.2) return '低め';
  return 'とても低い';
}

function describeAttachmentStyle(style: AttachmentStyle): string {
  switch (style) {
    case 'secure':
      return '人との関係において比較的安定した基盤を持っている傾向があります。';
    case 'preoccupied':
      return '人との関係において、相手の反応が気になりやすい傾向があります。';
    case 'dismissing':
      return '自分のペースを大切にする傾向があり、深い関係を築くのに時間がかかる場合があります。';
    case 'fearful':
      return '人との距離感に敏感な面があります。';
  }
}

function describeIdentityStatus(status: IdentityStatus): string {
  switch (status) {
    case 'moratorium':
      return '現在積極的に探索中';
    case 'diffusion':
      return 'これから探索できる状態';
    case 'achievement':
      return '自分なりの答えを見つけている';
    case 'foreclosure':
      return '一定の方向性がある（さらなる探索の余地あり）';
  }
}

function buildPsychologySection(
  bigFive: BigFiveScore | null,
  attachment: AttachmentProfile | null,
  identityStatus: IdentityStatusRecord[],
): string {
  const lines: string[] = [];

  if (bigFive) {
    lines.push(`\n## あなたのユーザー理解\n`);
    lines.push(`### Big Five傾向（信頼度: ${Math.round(bigFive.confidence * 100)}%）`);

    if (bigFive.openness != null) {
      lines.push(
        `- 経験への開放性: ${Math.round(bigFive.openness * 100)}% ← 新しいことへの好奇心・創造性の傾向`,
      );
    }
    if (bigFive.conscientiousness != null) {
      lines.push(
        `- 誠実性: ${Math.round(bigFive.conscientiousness * 100)}% ← 計画性・責任感の傾向`,
      );
    }
    if (bigFive.extraversion != null) {
      lines.push(
        `- 外向性: ${Math.round(bigFive.extraversion * 100)}% ← 社交性・活動性の傾向`,
      );
    }
    if (bigFive.agreeableness != null) {
      lines.push(
        `- 協調性: ${Math.round(bigFive.agreeableness * 100)}% ← 他者への共感・協力の傾向`,
      );
    }
    if (bigFive.neuroticism != null) {
      lines.push(
        `- 感情的感受性: ${Math.round(bigFive.neuroticism * 100)}% ← 感情の揺れやすさ（これは特性であり欠点ではない）`,
      );
    }
  }

  if (attachment?.style) {
    lines.push(`\n### 対人関係のパターン（愛着スタイル）`);
    lines.push(describeAttachmentStyle(attachment.style));
  }

  const validStatuses = identityStatus.filter((r) => r.status != null);
  if (validStatuses.length > 0) {
    lines.push(`\n### 現在の探索状況`);
    for (const record of validStatuses) {
      const domainLabel = IDENTITY_DOMAIN_LABELS[record.domain] ?? record.domain;
      lines.push(`- ${domainLabel}: ${describeIdentityStatus(record.status!)}`);
    }
  }

  if (lines.length === 0) return '';

  lines.push(`
## 応答する際の注意事項（心理学プロファイル）

1. Big Fiveスコアをユーザーに直接数値で伝えない（「あなたのneuroticismは0.7です」→NG）。代わりに「感情の波を感じやすい傾向があるようです」と表現する
2. 愛着スタイルをラベルで伝えない（「あなたは不安型です」→NG）。代わりに傾向として表現する
3. identity_statusが「これから探索できる状態」でも否定的に扱わない。「これから探索できる状態」として扱う
4. WEIRDバイアス注意: 自律性・個人の選択・独立性を一方的にポジティブな価値として扱わない。集団・義務・関係性からの動機づけも等しく尊重する`);

  return lines.join('\n');
}

export function buildChatSystemPrompt(
  persona: PersonaJson,
  experiences: ExperienceData[],
  bigFive: BigFiveScore | null = null,
  attachment: AttachmentProfile | null = null,
  identityStatus: IdentityStatusRecord[] = [],
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
    styleGuidelines.push('- introversionが高いため、静かで思慮深いトーンを保ってください');
  }
  if ((traits.curiosity ?? 0) >= 0.6) {
    styleGuidelines.push(
      '- curiosityが高いため、分析的・探索的な視点で関わってください',
    );
  }

  const psychologySection = buildPsychologySection(bigFive, attachment, identityStatus);

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
${styleGuidelines.join('\n')}${psychologySection}`;
}
