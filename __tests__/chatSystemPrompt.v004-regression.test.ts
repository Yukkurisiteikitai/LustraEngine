import { buildChatSystemPrompt } from '@/application/llm/chatSystemPrompt';
import type { BigFiveScore } from '@/core/entities/PsychologyProfile';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';

const activeHypotheses: TraitHypothesisRecord[] = [
  {
    id: 'th-1',
    userId: 'user-1',
    traitKey: 'introversion',
    hypothesisLabel: 'high',
    hypothesisText: '現時点のログ上、内向性が高めという仮説があります。',
    score: 0.7,
    confidence: 0.9,
    uncertainty: 0.1,
    evidenceIds: ['exp-1'],
    sourcePatternIds: ['cluster-1'],
    modelName: 'model-a',
    modelVersion: '1',
    promptVersion: 'v004',
    status: 'active',
    createdAt: '2026-05-14T00:00:00.000Z',
    supersedesHypothesisId: null,
    supersededByHypothesisId: null,
    analysisJobId: null,
  },
];

const bigFive: BigFiveScore = {
  userId: 'user-1',
  openness: 0.8,
  conscientiousness: 0.7,
  extraversion: 0.4,
  agreeableness: 0.6,
  neuroticism: 0.2,
  confidence: 0.9,
  evidenceCount: 12,
  applyCulturalAdjustment: true,
  updatedAt: '2026-05-14T00:00:00.000Z',
};

describe('chatSystemPrompt V-004 regression', () => {
  it('keeps the required wording focused on tendencies and advice, not identity assertions', () => {
    const prompt = buildChatSystemPrompt([], activeHypotheses, bigFive, null, []);

    const instructionSection = prompt.split('## 応答する際の注意事項（心理学プロファイル）')[1] ?? '';
    const sanitizedInstructions = instructionSection.replace(/（[^）]*→NG[^）]*）/g, '');
    const requiredPhrases = instructionSection
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('代わりに'))
      .map((line) => line.split('代わりに')[1]?.trim() ?? '');

    expect(requiredPhrases.join('\n')).toContain('感情の波を感じやすい傾向があるようです');
    expect(requiredPhrases.join('\n')).toContain('傾向として表現する');
    expect(sanitizedInstructions).toContain('これから探索できる状態');
    expect(requiredPhrases.join('\n')).not.toContain('あなたは不安型です');
    expect(requiredPhrases.join('\n')).not.toContain('あなたは内向性');
    expect(prompt).toContain('傾向');
  });
});
