'use client';

import styles from './logSteps.module.css';

interface TriggerFollowupStepProps {
  question: string;
  value: string;
  onChange: (next: string) => void;
  onSkip: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export default function TriggerFollowupStep({
  question,
  value,
  onChange,
  onSkip,
  onSave,
  isSaving,
}: TriggerFollowupStepProps) {
  return (
    <section className={styles.section} aria-label="step 3 — きっかけの追加質問">
      <p className={styles.helper}>あと1問だけ、もしわかれば教えてください（スキップしてもOK）。</p>

      <div className={styles.triggerBox}>
        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.55 }}>{question}</p>
        <input
          className={styles.inlineInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="思い当たることを一言で…"
        />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button
          type="button"
          className={styles.skipLink}
          onClick={onSkip}
          disabled={isSaving}
        >
          スキップして保存
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          style={{
            padding: '0.7rem 1.3rem',
            borderRadius: 999,
            border: 0,
            background: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          {isSaving ? '保存中…' : '✓ 保存する'}
        </button>
      </div>
    </section>
  );
}
