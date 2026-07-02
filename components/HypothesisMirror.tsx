'use client';

import { useState } from 'react';
import { MockQueryProvider } from '@/lib/mockQueryClient';
import {
  useLiveHypotheses,
  useHypothesisHistory,
  useVerifyHypothesis,
  type LiveHypothesis,
} from '@/lib/useHypothesisMirror';
import styles from './HypothesisMirror.module.css';

const TRAIT_LABELS: Record<string, string> = {
  introversion: '内向性',
  discipline: '自律性',
  curiosity: '好奇心',
  risk_tolerance: 'リスク許容度',
  self_criticism: '自己批判',
  social_anxiety: '社会不安',
};

function confidenceLevel(confidence: number): { label: string; dots: number } {
  if (confidence >= 0.67) return { label: '高', dots: 3 };
  if (confidence >= 0.34) return { label: '中', dots: 2 };
  return { label: '低', dots: 1 };
}

function ConfidenceDots({ confidence }: { confidence: number }) {
  const { label, dots } = confidenceLevel(confidence);
  return (
    <span className={styles.confidenceDots}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`${styles.dot} ${n <= dots ? styles.dotFilled : ''}`}
        />
      ))}
      <span className={styles.confidenceText}>{label}</span>
    </span>
  );
}

function HypothesisHistory({ traitKey }: { traitKey: string }) {
  const { data: history, isLoading } = useHypothesisHistory(traitKey);

  if (isLoading) return <p className={styles.loading}>履歴を読み込み中…</p>;
  if (!history || history.length === 0) return null;

  return (
    <div className={styles.historyPanel}>
      <h4 className={styles.historyTitle}>訂正の堆積</h4>
      <div className={styles.historyList}>
        {history.map((entry) => (
          <div key={entry.id} className={styles.historyEntry}>
            <div className={styles.historyMeta}>
              <span className={styles.historyStatus}>{entry.status}</span>
              {entry.source !== 'model' && (
                <span className={styles.historyStatus}>{entry.source}</span>
              )}
              <span className={styles.historyDate}>
                {new Date(entry.createdAt).toLocaleDateString('ja-JP')}
              </span>
            </div>
            <p className={styles.historyText}>{entry.hypothesisText}</p>
            {entry.userCorrection && (
              <p className={styles.historyCorrection}>訂正: {entry.userCorrection}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HypothesisCard({
  hypothesis,
  isSelected,
  onSelect,
}: {
  hypothesis: LiveHypothesis;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [showRevise, setShowRevise] = useState(false);
  const [correction, setCorrection] = useState('');
  const verify = useVerifyHypothesis();

  const label = TRAIT_LABELS[hypothesis.traitKey] ?? hypothesis.traitKey;
  const isPending = verify.isPending;

  function handleAction(action: 'confirm' | 'hold') {
    verify.reset();
    verify.mutate({ id: hypothesis.id, action });
  }

  function handleReviseToggle() {
    verify.reset();
    setShowRevise((v) => !v);
  }

  function handleReviseSubmit() {
    if (!correction.trim()) return;
    verify.mutate(
      { id: hypothesis.id, action: 'revise', correction },
      {
        onSuccess: () => {
          setShowRevise(false);
          setCorrection('');
        },
      },
    );
  }

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
    >
      <div className={styles.cardHeader}>
        <span className={styles.traitLabel}>{label}</span>
        <ConfidenceDots confidence={hypothesis.confidence} />
      </div>

      {hypothesis.verifiedAt && hypothesis.status !== 'needs_review' && (
        <span className={styles.verifiedBadge}>確認済み</span>
      )}
      {hypothesis.status === 'needs_review' && (
        <span className={styles.holdBadge}>保留中</span>
      )}

      <p className={styles.hypothesisText}>{hypothesis.hypothesisText}</p>

      <div className={styles.actionRow} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.btnConfirm}
          disabled={isPending}
          onClick={() => handleAction('confirm')}
        >
          近い
        </button>
        <button
          className={styles.btnRevise}
          disabled={isPending}
          onClick={handleReviseToggle}
        >
          違う・精緻化
        </button>
        <button
          className={styles.btnHold}
          disabled={isPending}
          onClick={() => handleAction('hold')}
        >
          今は答えにくい
        </button>
      </div>

      {showRevise && (
        <div className={styles.revisePanel} onClick={(e) => e.stopPropagation()}>
          <p className={styles.reviseLabel}>どう違いますか？補足・修正を書いてください。</p>
          <textarea
            className={styles.reviseTextarea}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="例：実際には〜の場合に限られます。〜という側面もあります。"
          />
          <div className={styles.reviseActions}>
            <button
              className={styles.btnSubmit}
              disabled={isPending || !correction.trim()}
              onClick={handleReviseSubmit}
            >
              {isPending ? '更新中…' : '送信'}
            </button>
            <button
              className={styles.btnCancel}
              onClick={() => {
                setShowRevise(false);
                setCorrection('');
              }}
            >
              キャンセル
            </button>
          </div>
          {verify.isError && (
            <p className={styles.mutationError}>
              {verify.error instanceof Error ? verify.error.message : 'エラーが発生しました'}
            </p>
          )}
        </div>
      )}

      {isSelected && <HypothesisHistory traitKey={hypothesis.traitKey} />}
    </div>
  );
}

function HypothesisMirrorInner() {
  const { data: hypotheses, isLoading, isError, error } = useLiveHypotheses();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>構造の鏡 — 仮説を確認する</h2>
        <p className={styles.loading}>仮説を読み込み中…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>構造の鏡 — 仮説を確認する</h2>
        <p className={styles.errorBox}>
          {error instanceof Error ? error.message : '仮説の読み込みに失敗しました'}
        </p>
      </section>
    );
  }

  if (!hypotheses || hypotheses.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>構造の鏡 — 仮説を確認する</h2>
        <p className={styles.empty}>
          まだ仮説がありません。記録を追加して仮説を推論すると、ここで確認・訂正できます。
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>構造の鏡 — 仮説を確認する</h2>
      <div className={styles.cardList}>
        {hypotheses.map((h) => (
          <HypothesisCard
            key={h.id}
            hypothesis={h}
            isSelected={selectedId === h.id}
            onSelect={() => setSelectedId((prev) => (prev === h.id ? null : h.id))}
          />
        ))}
      </div>
    </section>
  );
}

export default function HypothesisMirror() {
  return (
    <MockQueryProvider>
      <HypothesisMirrorInner />
    </MockQueryProvider>
  );
}
