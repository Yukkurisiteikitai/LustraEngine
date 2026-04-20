'use client';

import type { IdentityStatusRecord, IdentityStatus } from '@/core/entities/PsychologyProfile';

const DOMAIN_LABELS: Record<string, string> = {
  career: '仕事・キャリア',
  values: '価値観',
  relationships: '人間関係',
  interests: '興味・関心',
};

const STATUS_LABELS: Record<IdentityStatus, string> = {
  achievement: '自分なりの答えがある',
  moratorium: '積極的に探索中',
  foreclosure: '方向性がある（探索の余地あり）',
  diffusion: 'これから探索できる段階',
};

interface Props {
  records: IdentityStatusRecord[];
}

export default function IdentityExplorationCard({ records }: Props) {
  if (records.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
        まだ分析中...（記録を続けることで傾向が見えてきます）
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {records.map((record) => {
        const exploration = record.explorationScore ?? 0;
        const commitment = record.commitmentScore ?? 0;
        const statusLabel = record.status ? STATUS_LABELS[record.status] : null;

        return (
          <div key={record.domain} style={{ padding: '0.75rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600 }}>
                {DOMAIN_LABELS[record.domain] ?? record.domain}
              </span>
              {statusLabel && (
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{statusLabel}</span>
              )}
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '2px' }}>
                探索の深さ
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: '#6366f1',
                    width: `${Math.round(exploration * 100)}%`,
                    height: '100%',
                    transition: 'width 0.4s',
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '2px' }}>
                コミットメントの強さ
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: '#10b981',
                    width: `${Math.round(commitment * 100)}%`,
                    height: '100%',
                    transition: 'width 0.4s',
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
