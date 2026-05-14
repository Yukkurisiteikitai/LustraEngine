import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';
import type { UserModelSnapshot, UserModelHypothesisSummary } from '@/types';

function toSummary(h: TraitHypothesisRecord): UserModelHypothesisSummary {
  return {
    traitKey: h.traitKey,
    hypothesisLabel: h.hypothesisLabel,
    hypothesisText: h.hypothesisText,
    score: h.score,
    confidence: h.confidence,
    uncertainty: h.uncertainty,
  };
}

export function buildUserModelSnapshot(
  userId: string,
  hypotheses: TraitHypothesisRecord[],
): UserModelSnapshot {
  const topHypotheses = hypotheses.slice(0, 6).map(toSummary);
  const createdAt = hypotheses[0]?.createdAt ?? new Date().toISOString();
  const summaryText =
    hypotheses.length > 0
      ? `現在の仮説は ${hypotheses.length} 件あります。`
      : '十分な仮説がありません。記録を追加するとモデル要約を更新できます。';

  return {
    id: `user-model-${userId}`,
    userId,
    snapshotKind: 'hypothesis_summary',
    activeHypothesisCount: hypotheses.length,
    topHypotheses,
    summaryText,
    evidenceCount: hypotheses.reduce((sum, h) => sum + h.evidenceIds.length, 0),
    modelName: hypotheses[0]?.modelName,
    modelVersion: hypotheses[0]?.modelVersion,
    promptVersion: hypotheses[0]?.promptVersion,
    createdAt,
  };
}

export function summarizeUserModelSnapshot(snapshot: UserModelSnapshot): string {
  const topLabels = snapshot.topHypotheses
    .slice(0, 3)
    .map((h) => h.hypothesisText)
    .join(' / ');
  return `${snapshot.summaryText}${topLabels ? ` ${topLabels}` : ''}`;
}
