'use client';

import { useState } from 'react';
import DomainSelector from '@/components/DomainSelector';
import type {
  ActionResult,
  Domain,
  ExperienceEmotion,
  TimeOfDay,
} from '@/types';
import { ACTION_RESULT_VALUES } from '@/types';
import styles from './logSteps.module.css';

export interface ConfirmDraft {
  description: string;
  context: string;
  domain: Domain | '';
  emotions: ExperienceEmotion[];
  actionResult: ActionResult;
  timeOfDay: TimeOfDay;
  durationMinutes: number | null;
  stressLevel: number;
}

const ACTION_LABEL: Record<ActionResult, { main: string; sub?: string }> = {
  CONFRONTED_SUCCESS: { main: '向き合えた', sub: '成功' },
  CONFRONTED_FAILED: { main: '向き合った', sub: '届かなかった' },
  PARTIAL: { main: '一部だけ進んだ' },
  AVOIDED: { main: '回避した' },
};

const STRESS_LEGEND = [
  '1: ほぼ平常心',
  '2: 少しモヤモヤ',
  '3: 集中が乱れる',
  '4: かなりつらい',
  '5: 何もできない',
];

interface ExtractedConfirmStepProps {
  draft: ConfirmDraft;
  onChange: (next: ConfirmDraft) => void;
  onBack: () => void;
  onNext: () => void;
  onSaveDirect: () => void;
  isSaving: boolean;
  needsTriggerFollowup: boolean;
}

export default function ExtractedConfirmStep({
  draft,
  onChange,
  onBack,
  onNext,
  onSaveDirect,
  isSaving,
  needsTriggerFollowup,
}: ExtractedConfirmStepProps) {
  const [newEmotion, setNewEmotion] = useState('');

  function patch<K extends keyof ConfirmDraft>(key: K, value: ConfirmDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function setEmotionIntensity(index: number, intensity: ExperienceEmotion['intensity']) {
    const next = draft.emotions.map((e, i) => (i === index ? { ...e, intensity } : e));
    patch('emotions', next);
  }

  function removeEmotion(index: number) {
    patch(
      'emotions',
      draft.emotions.filter((_, i) => i !== index),
    );
  }

  function addEmotion() {
    const label = newEmotion.trim();
    if (!label || draft.emotions.length >= 5) return;
    patch('emotions', [...draft.emotions, { label, intensity: 3 }]);
    setNewEmotion('');
  }

  const canProceed = draft.description.trim() !== '' && draft.domain !== '';

  return (
    <section className={styles.section} aria-label="step 2 — 抽出結果の確認">
      <p className={styles.helper}>AIが読み取った内容を確認してください。違うところは直せます。</p>

      <div className={styles.fieldRow}>
        <span className={styles.fieldKey}>やったこと</span>
        <input
          className={styles.inlineInput}
          value={draft.description}
          onChange={(e) => patch('description', e.target.value)}
          placeholder="1行で"
        />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldKey}>場所</span>
        <input
          className={styles.inlineInput}
          value={draft.context}
          onChange={(e) => patch('context', e.target.value)}
          placeholder="例: スタバ、自宅"
        />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldKey}>時間帯</span>
        <select
          className={styles.inlineInput}
          value={draft.timeOfDay}
          onChange={(e) => patch('timeOfDay', e.target.value as TimeOfDay)}
        >
          <option value="morning">朝 (5-11)</option>
          <option value="afternoon">昼 (11-17)</option>
          <option value="evening">夕 (17-21)</option>
          <option value="night">夜 (21-5)</option>
        </select>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldKey}>所要時間</span>
        <input
          className={styles.inlineInput}
          type="number"
          min={0}
          value={draft.durationMinutes ?? ''}
          onChange={(e) =>
            patch('durationMinutes', e.target.value === '' ? null : Number(e.target.value))
          }
          placeholder="分（任意）"
        />
      </div>

      <div>
        <span className={styles.label}>感情</span>
        <div className={styles.chipRow}>
          {draft.emotions.map((e, i) => (
            <span key={`${e.label}-${i}`} className={styles.chip}>
              {e.label}
              <span className={styles.dots} aria-label={`強さ ${e.intensity}/5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.dot} ${n <= e.intensity ? styles.dotOn : ''}`}
                    onClick={() =>
                      setEmotionIntensity(i, n as ExperienceEmotion['intensity'])
                    }
                    aria-label={`強さ ${n}`}
                  />
                ))}
              </span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => removeEmotion(i)}
                aria-label={`${e.label}を削除`}
              >
                ×
              </button>
            </span>
          ))}
          {draft.emotions.length < 5 ? (
            <span className={styles.chip}>
              <input
                className={styles.inlineInput}
                style={{ width: 100, padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}
                value={newEmotion}
                onChange={(e) => setNewEmotion(e.target.value)}
                placeholder="追加"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmotion();
                  }
                }}
              />
              <button
                type="button"
                className={styles.chipRemove}
                onClick={addEmotion}
                aria-label="感情を追加"
              >
                +
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <span className={styles.label}>結果</span>
        <div className={styles.actionGrid}>
          {ACTION_RESULT_VALUES.map((r) => (
            <button
              key={r}
              type="button"
              className={styles.actionButton}
              data-selected={draft.actionResult === r || undefined}
              onClick={() => patch('actionResult', r)}
            >
              {ACTION_LABEL[r].main}
              {ACTION_LABEL[r].sub ? <small>{ACTION_LABEL[r].sub}</small> : null}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={styles.label}>領域</span>
        <DomainSelector
          value={draft.domain || undefined}
          onChange={(d) => patch('domain', d)}
        />
      </div>

      <div>
        <span className={styles.label}>ストレス度</span>
        <div className={styles.stressScale}>
          <input
            type="range"
            min={1}
            max={5}
            value={draft.stressLevel}
            onChange={(e) => patch('stressLevel', Number(e.target.value))}
            className={styles.stressSlider}
          />
          <div className={styles.stressLegend}>
            {STRESS_LEGEND.map((label) => (
              <span key={label}>{label.slice(0, 1)}</span>
            ))}
          </div>
          <p className={styles.helper}>{STRESS_LEGEND[draft.stressLevel - 1]}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '0.7rem 1.3rem',
            borderRadius: 999,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-card)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          戻る
        </button>
        <button
          type="button"
          onClick={needsTriggerFollowup ? onNext : onSaveDirect}
          disabled={!canProceed || isSaving}
          style={{
            padding: '0.7rem 1.3rem',
            borderRadius: 999,
            border: 0,
            background: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
            cursor: canProceed && !isSaving ? 'pointer' : 'not-allowed',
            opacity: canProceed && !isSaving ? 1 : 0.6,
            fontWeight: 600,
          }}
        >
          {isSaving ? '保存中…' : needsTriggerFollowup ? '次へ' : '✓ 保存する'}
        </button>
      </div>
    </section>
  );
}
