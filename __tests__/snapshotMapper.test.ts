import { buildUserModelSnapshot, summarizeUserModelSnapshot } from '@/application/mappers/UserModelSnapshotMapper';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';

const hypotheses: TraitHypothesisRecord[] = [
  {
    id: 'th-1',
    userId: 'user-1',
    traitKey: 'introversion',
    hypothesisLabel: 'high',
    hypothesisText: '現時点のログ上、内向性が高めという仮説があります。',
    score: 0.7,
    confidence: 0.9,
    uncertainty: 0.1,
    evidenceIds: ['exp-1', 'exp-2'],
    sourcePatternIds: ['cluster-1'],
    modelName: 'model-a',
    modelVersion: '1',
    promptVersion: 'v004',
    status: 'active',
    supersedesHypothesisId: null,
    supersededByHypothesisId: null,
    analysisJobId: null,
    createdAt: '2026-05-14T00:00:00.000Z',
  },
];

describe('UserModelSnapshotMapper', () => {
  it('summarizes active hypotheses without exposing personaJson', () => {
    const snapshot = buildUserModelSnapshot('user-1', hypotheses);

    expect(snapshot.userId).toBe('user-1');
    expect(snapshot.snapshotKind).toBe('hypothesis_summary');
    expect(snapshot.activeHypothesisCount).toBe(1);
    expect(snapshot.evidenceCount).toBe(2);
    expect(snapshot.topHypotheses[0].hypothesisText).toContain('内向性');
    expect(snapshot.summaryText).toContain('現在の仮説は 1 件あります');
    expect(summarizeUserModelSnapshot(snapshot)).toContain('内向性が高め');
  });
});
