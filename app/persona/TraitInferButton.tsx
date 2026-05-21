'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

type AnalysisMode = 'quick' | 'full_3months' | null;

interface TraitInferButtonProps {
  disabled?: boolean;
}

export default function TraitInferButton({ disabled = false }: TraitInferButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleAnalyze(mode: AnalysisMode) {
    if (!mode) return;

    setIsPending(true);
    setMessage(null);
    setShowModeSelection(false);
    try {
      const res = await fetch('/api/analysis/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json()) as { message?: string; ok?: boolean };
      if (!res.ok) throw new Error(json.message ?? '分析に失敗しました');
      setMessage({ type: 'success', text: json.message ?? '分析を開始しました' });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '分析に失敗しました' });
    } finally {
      setIsPending(false);
      setSelectedMode(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.inferBtn}
        onClick={() => setShowModeSelection(!showModeSelection)}
        disabled={isPending || disabled}
      >
        {disabled ? '更新は無効です' : isPending ? '更新中...' : '仮説を更新'}
      </button>

      {showModeSelection && !isPending && !disabled && (
        <div className={styles.modeSelectionBox}>
          <p className={styles.modeSelectionTitle}>仮説を更新しますか？</p>

          <div className={styles.modeOption}>
            <button
              type="button"
              className={styles.modeButton}
              onClick={() => handleAnalyze('quick')}
            >
              クイック更新
            </button>
            <p className={styles.modeDescription}>
              直近1週間の記録をもとに、短時間で仮説を更新します。
            </p>
          </div>

          <div className={styles.modeOption}>
            <button
              type="button"
              className={styles.modeButton}
              onClick={() => handleAnalyze('full_3months')}
            >
              3か月更新
            </button>
            <p className={styles.modeDescription}>
              過去3か月の集約と直近ログを使い、より深く仮説を更新します。
            </p>
          </div>

          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => {
              setShowModeSelection(false);
              setSelectedMode(null);
            }}
          >
            キャンセル
          </button>
        </div>
      )}

      {message && (
        <div className={message.type === 'success' ? styles.successBox : styles.errorBox}>
          {message.text}
        </div>
      )}
    </>
  );
}
