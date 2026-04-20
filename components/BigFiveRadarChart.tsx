'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import type { BigFiveScore } from '@/core/entities/PsychologyProfile';

const LABELS: Record<string, string> = {
  openness: '新しい経験への\n開放性',
  conscientiousness: '計画性・誠実さ',
  extraversion: '外向き・内向きの\nエネルギー',
  agreeableness: '協調・調和',
  neuroticism: '感情の感受性',
};

interface Props {
  score: BigFiveScore;
}

export default function BigFiveRadarChart({ score }: Props) {
  if (score.confidence < 0.3) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        データ収集中...（あと少し記録を続けると分析が始まります）
      </div>
    );
  }

  const data = [
    { subject: LABELS.openness, value: score.openness ?? 0 },
    { subject: LABELS.conscientiousness, value: score.conscientiousness ?? 0 },
    { subject: LABELS.extraversion, value: score.extraversion ?? 0 },
    { subject: LABELS.agreeableness, value: score.agreeableness ?? 0 },
    { subject: LABELS.neuroticism, value: score.neuroticism ?? 0 },
  ];

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
        <Radar
          dataKey="value"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.3}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
