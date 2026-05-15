'use client';

import { FormEvent, useEffect, useState } from 'react';
import styles from './ObstacleForm.module.css';
import DomainSelector from './DomainSelector';
import StressSlider from './StressSlider';
import type { Domain } from '@/types';

export interface ObstacleDraft {
  description: string;
  domain?: Domain;
  stressLevel: number;
  reportDifficulty: number;
  goal?: string;
  emotion?: string;
  context?: string;
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
  reportDifficulty: 3,
  goal: '',
  emotion: '',
  context: '',
};

export default function ObstacleForm({
  initialValue = DEFAULT_VALUE,
  onSubmit,
  submitLabel = '完了',
}: ObstacleFormProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ObstacleDraft>(initialValue);
  const [errors, setErrors] = useState<ObstacleFormErrors>({});

  useEffect(() => {
    setForm(initialValue);
  }, [initialValue]);

  const totalSteps = 3;

  function validateStep(currentStep: number) {
    const nextErrors: ObstacleFormErrors = {};
    if (currentStep === 1) {
      if (!form.description.trim()) {
        nextErrors.description = '内容を入力してください';
      }
    }
    if (currentStep === 2) {
      if (!form.domain) {
        nextErrors.domain = '領域を選択してください';
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function nextStep() {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, totalSteps));
    }
  }

  function prevStep() {
    setStep((prev) => Math.max(prev - 1, 1));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validateStep(step)) {
      if (form.domain) {
        onSubmit({ ...form, domain: form.domain });
      }
    }
  }

  return (
    <div className={styles.formContainer}>
      <div className={styles.progress}>
        <div 
          className={styles.progressBar} 
          style={{ width: `${(step / totalSteps) * 100}%` }} 
        />
        <span className={styles.stepText}>Step {step} of {totalSteps}</span>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {step === 1 && (
          <div className={styles.stepContent} key="step1">
            <div className={styles.group}>
              <label className={styles.label} htmlFor="description">
                いま、どのような障害に向き合っていますか？
              </label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, description: event.target.value }));
                  if (errors.description) {
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
                className={styles.input}
                rows={4}
                maxLength={200}
                placeholder="例: 会議で発言するのが怖い、やる気が出ない..."
                aria-invalid={Boolean(errors.description)}
                autoFocus
                required
              />
              {errors.description && (
                <p className={styles.error} role="alert">{errors.description}</p>
              )}
            </div>
            <button type="button" className={styles.submit} onClick={nextStep}>
              次へ
            </button>
          </div>
        )}

        {step === 2 && (
          <div className={styles.stepContent} key="step2">
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

            <div className={styles.group}>
              <label className={styles.label} htmlFor="reportDifficulty">
                この記録はどれくらい慎重に扱うべきですか？
              </label>
              <input
                id="reportDifficulty"
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.reportDifficulty}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reportDifficulty: Number(event.target.value) }))
                }
                className={styles.input}
              />
              <div className={styles.scale} aria-hidden>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.back} onClick={prevStep}>戻る</button>
              <button type="button" className={styles.submit} onClick={nextStep}>次へ</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepContent} key="step3">
            <div className={styles.group}>
              <label className={styles.label} htmlFor="emotion">
                そのとき、どのような感情でしたか？（任意）
              </label>
              <input
                id="emotion"
                type="text"
                value={form.emotion ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, emotion: event.target.value }))}
                className={styles.input}
                placeholder="例: 不安、焦り、孤独"
              />
            </div>

            <div className={styles.group}>
              <label className={styles.label} htmlFor="context">
                どのような状況でしたか？（任意）
              </label>
              <textarea
                id="context"
                rows={2}
                value={form.context ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, context: event.target.value }))}
                className={styles.input}
                placeholder="例: ひとりで机に向かっているとき"
              />
            </div>

            <div className={styles.group}>
              <label className={styles.label} htmlFor="goal">
                本来、何をしようとしていましたか？（任意）
              </label>
              <input
                id="goal"
                type="text"
                value={form.goal ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                className={styles.input}
                placeholder="例: 資格試験の勉強"
              />
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.back} onClick={prevStep}>戻る</button>
              <button type="submit" className={styles.submit}>
                {submitLabel}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
