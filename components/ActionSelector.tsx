'use client';

import styles from './ActionSelector.module.css';
import type { ActionResult } from '@/types';

interface ActionSelectorProps {
  value: ActionResult | '';
  action: string;
  actionText: string;
  onChangeResult: (value: ActionResult) => void;
  onChangeAction: (value: string) => void;
  onChangeText: (value: string) => void;
  error?: string;
}

export default function ActionSelector({
  value,
  action,
  actionText,
  onChangeResult,
  onChangeAction,
  onChangeText,
  error,
}: ActionSelectorProps) {
  return (
    <section className={styles.wrapper} aria-describedby={error ? 'action-result-error' : undefined}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>行動結果</legend>

        <label className={styles.radioRow}>
          <input
            type="radio"
            name="actionResult"
            value="AVOIDED"
            checked={value === 'AVOIDED'}
            onChange={() => onChangeResult('AVOIDED')}
          />
          回避した
        </label>

        <label className={styles.radioRow}>
          <input
            type="radio"
            name="actionResult"
            value="CONFRONTED"
            checked={value === 'CONFRONTED'}
            onChange={() => onChangeResult('CONFRONTED')}
          />
          向き合った
        </label>
      </fieldset>

      {error ? (
        <p className={styles.error} id="action-result-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.memo}>
        <label className={styles.label} htmlFor="action">
          実際にしたこと（任意）
        </label>
        <textarea
          id="action"
          value={action}
          onChange={(event) => onChangeAction(event.target.value)}
          rows={2}
          maxLength={200}
          className={styles.textarea}
          placeholder="例: YouTubeを見た"
        />
      </div>

      <div className={styles.memo}>
        <label className={styles.label} htmlFor="actionText">
          追加メモ（任意）
        </label>
        <textarea
          id="actionText"
          value={actionText}
          onChange={(event) => onChangeText(event.target.value)}
          rows={3}
          maxLength={300}
          className={styles.textarea}
          placeholder="例: 朝イチで5分だけ取り組んだ"
        />
      </div>
    </section>
  );
}
