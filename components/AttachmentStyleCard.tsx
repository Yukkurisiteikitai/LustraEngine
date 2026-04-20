'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { AttachmentProfile, AttachmentStyle } from '@/core/entities/PsychologyProfile';

const STYLE_LABELS: Record<AttachmentStyle, string> = {
  secure: '安定したつながり',
  preoccupied: 'つながりを大切にするタイプ',
  dismissing: '自立を大切にするタイプ',
  fearful: '関係に慎重なタイプ',
};

interface Props {
  profile: AttachmentProfile;
}

export default function AttachmentStyleCard({ profile }: Props) {
  if (profile.confidence < 0.3) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
        まだ分析中...（記録を続けることで傾向が見えてきます）
      </div>
    );
  }

  const anxiety = profile.anxietyScore ?? 4;
  const avoidance = profile.avoidanceScore ?? 4;
  const styleLabel = profile.style ? STYLE_LABELS[profile.style] : null;

  const point = [{ x: avoidance, y: anxiety }];

  return (
    <div>
      {styleLabel && (
        <p style={{ textAlign: 'center', marginBottom: '0.5rem', fontWeight: 600 }}>
          {styleLabel}
        </p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[1, 7]}
            name="回避傾向"
            label={{ value: '←自立　　　　つながり→', position: 'insideBottom', offset: -12, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[1, 7]}
            name="不安傾向"
            label={{ value: '不安の強さ', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) => {
              const v = typeof value === 'number' ? value.toFixed(1) : String(value);
              const label = name === 'x' ? '回避傾向' : '不安傾向';
              return [v, label] as [string, string];
            }}
          />
          <ReferenceLine x={4} stroke="#d1d5db" />
          <ReferenceLine y={4} stroke="#d1d5db" />
          <Scatter data={point} fill="#6366f1" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}