export interface EvidenceLoggingFallback {
  mode: 'evidence_logging';
  reason: 'active_hypotheses_empty';
  questions: string[];
  suggestedTemplate: string;
}

export function buildEvidenceLoggingFallback(): EvidenceLoggingFallback {
  return {
    mode: 'evidence_logging',
    reason: 'active_hypotheses_empty',
    questions: [
      '直近で強く気になった出来事は何でしたか？',
      'そのとき避けたこと、向き合ったことは何でしたか？',
      'その出来事は仕事・人間関係・健康・お金・自己のどれに近いですか？',
    ],
    suggestedTemplate: '出来事 / 感情 / 避けたこと or 向き合ったこと / 関係する領域',
  };
}
