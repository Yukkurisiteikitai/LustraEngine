'use client';

import { FormEvent, useState } from 'react';
import styles from './ObstacleForm.module.css';
import DomainSelector from './DomainSelector';
import StressSlider from './StressSlider';
import type { Domain } from '@/types';

export interface ObstacleDraft {
  description: string;
  domain?: Domain;
  stressLevel: number;
}

interface ObstacleFormProps {
  initialValue?: ObstacleDraft;
  onSubmit: (value: ObstacleDraft & { domain: Domain }) => void;
  submitLabel?: string;
}

interface ObstacleFormErrors {
  description?: string;
  domain?: string;
}

const DEFAULT_VALUE: ObstacleDraft = {
  description: '',
  domain: undefined,
  stressLevel: 3,
};

export default function ObstacleForm({
  initialValue = DEFAULT_VALUE,
  onSubmit,
  submitLabel = '次へ',
}: ObstacleFormProps) {
  const [form, setForm] = useState<ObstacleDraft>(initialValue);
  const [errors, setErrors] = useState<ObstacleFormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: ObstacleFormErrors = {};
    if (!form.description.trim()) {
      nextErrors.description = '障害の内容を入力してください';
    }
    if (!form.domain) {
      nextErrors.domain = '領域を選択してください';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !form.domain) {
      return;
    }

    onSubmit({ ...form, domain: form.domain });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.group}>
        <label className={styles.label} htmlFor="description">
          いま向き合っている障害
        </label>
        <input
          id="description"
          name="description"
          type="text"
          value={form.description}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, description: event.target.value }));
            if (errors.description) {
              setErrors((prev) => ({ ...prev, description: undefined }));
            }
          }}
          className={styles.input}
          placeholder="例: 上司に相談するのが怖い"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'description-error' : undefined}
          required
        />
        {errors.description ? (
          <p className={styles.error} id="description-error" role="alert">
            {errors.description}
          </p>
        ) : null}
      </div>

      <div className={styles.group}>
        <DomainSelector
          value={form.domain}
          onChange={(domain) => {
            setForm((prev) => ({ ...prev, domain }));
            if (errors.domain) {
              setErrors((prev) => ({ ...prev, domain: undefined }));
            }
          }}
          error={errors.domain}
        />
      </div>

      <div className={styles.group}>
        <StressSlider
          value={form.stressLevel}
          onChange={(stressLevel) => setForm((prev) => ({ ...prev, stressLevel }))}
        />
      </div>

      <button className={styles.submit} type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
