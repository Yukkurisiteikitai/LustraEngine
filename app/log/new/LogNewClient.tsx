'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ObstacleForm, { type ObstacleDraft } from '@/components/ObstacleForm';
import ActionSelector from '@/components/ActionSelector';
import { useSubmitLogMutation } from '@/lib/mockQueryClient';
import type { ActionResult, Domain } from '@/types';
import { consumeEvidenceLoggingDraft, type EvidenceLoggingDraft } from '@/lib/evidenceDraftStorage';
import styles from './page.module.css';

type Step = 1 | 2 | 3;

type ConfirmObstacle = {
  description: string;
  domain: Domain;
  stressLevel: number;
  goal?: string;
  emotion?: string;
  context?: string;
};

function domainToLabel(domain: Domain) {
  switch (domain) {
    case 'WORK':
      return '仕事';
    case 'RELATIONSHIP':
      return '人間関係';
    case 'HEALTH':
      return '健康';
    case 'MONEY':
      return 'お金';
    case 'SELF':
      return '自分';
    default:
      return domain;
  }
}

interface LogNewClientProps {
  evidenceTemplate?: string;
  evidenceQuestions?: string[];
  source?: 'chat_fallback' | 'manual';
}

export default function LogNewClient({
  evidenceTemplate = '',
  evidenceQuestions = [],
  source = 'manual',
}: LogNewClientProps) {
  const [step, setStep] = useState<Step>(1);
  const [obstacle, setObstacle] = useState<ConfirmObstacle | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | ''>('');
  const [actionBody, setActionBody] = useState('');
  const [actionText, setActionText] = useState('');
  const [actionError, setActionError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [restoredDraft, setRestoredDraft] = useState<EvidenceLoggingDraft | null>(null);

  const mutation = useSubmitLogMutation();
  useEffect(() => {
    const draft = consumeEvidenceLoggingDraft();
    if (draft) {
      setRestoredDraft(draft);
      setObstacle(null);
      setStep(1);
    }
  }, []);

  const activeTemplate = restoredDraft?.template ?? evidenceTemplate;
  const activeQuestions = restoredDraft?.questions ?? evidenceQuestions;
  const activeSource = restoredDraft?.source ?? source;

  const initialDraft = useMemo<ObstacleDraft>(() => ({
    description: activeTemplate || '',
    domain: undefined,
    stressLevel: 3,
    goal: '',
    emotion: '',
    context: '',
  }), [activeTemplate]);

  useEffect(() => {
    if (activeTemplate) {
      setObstacle(null);
      setStep(1);
    }
  }, [activeTemplate, activeQuestions]);

  function resetForm() {
    setStep(1);
    setObstacle(null);
    setActionResult('');
    setActionBody('');
    setActionText('');
    setStatusMessage('');
  }

  function handleObstacleSubmit(value: ObstacleDraft & { domain: Domain }) {
    setObstacle(value);
    setStep(2);
    setStatusMessage('');
  }

  function handleActionNext() {
    if (!actionResult) {
      setActionError('行動結果を選択してください');
      return;
    }
    setActionError('');
    setStep(3);
  }

  function handleSubmit() {
    if (!obstacle || !actionResult) {
      return;
    }

    mutation.mutate(
      {
        date: new Date().toISOString().slice(0, 10),
        obstacles: [
          {
            description: obstacle.description,
            domain: obstacle.domain,
            stressLevel: obstacle.stressLevel,
            actionResult,
            actionMemo: actionText || undefined,
            goal: obstacle.goal || undefined,
            action: actionBody || undefined,
            emotion: obstacle.emotion || undefined,
            context: obstacle.context || undefined,
            ...(activeSource === 'chat_fallback' ? { source: 'chat_fallback' } : {}),
          },
        ],
      },
      {
        onSuccess: () => {
          setMessageType('success');
          setStatusMessage('記録しました。次回の分析対象に追加されました。');
          setTimeout(resetForm, 2000);
        },
        onError: (error) => {
          console.error('[LogNewClient] Mutation error:', error);
          const errorMsg = error instanceof Error ? error.message : '不明なエラーが発生しました';
          setMessageType('error');
          setStatusMessage(`エラー: ${errorMsg}`);
        },
      },
    );
  }

  return (
    <>
      {activeTemplate ? (
        <div className={styles.evidenceDraftBox}>
          <p className={styles.evidenceDraftLabel}>Chat からの下書き</p>
          <p className={styles.evidenceDraftMeta}>
            evidenceType: {activeSource === 'chat_fallback' ? 'chat_fallback' : 'manual'} / domain: 未選択 / emotionalIntensity: 3 / reportDifficulty: 3
          </p>
          <p className={styles.evidenceDraftText}>{activeTemplate}</p>
          {activeQuestions.length > 0 ? (
            <ul className={styles.evidenceDraftList}>
              {activeQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : null}
          <div className={styles.evidenceDraftActions}>
            <Link href="/persona" className={styles.evidenceDraftLink}>
              仮説を更新
            </Link>
          </div>
        </div>
      ) : null}

      <p className={styles.progress}>Step {step} / 3</p>

      {step === 1 ? (
        <ObstacleForm
          initialValue={initialDraft}
          onSubmit={handleObstacleSubmit}
          submitLabel="次へ"
        />
      ) : null}

      {step === 2 ? (
        <div className={styles.stepBlock}>
          <ActionSelector
            value={actionResult}
            action={actionBody}
            actionText={actionText}
            onChangeResult={(value) => {
              setActionResult(value);
              setActionError('');
            }}
            onChangeAction={setActionBody}
            onChangeText={setActionText}
            error={actionError}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setStep(1)}>
              戻る
            </button>
            <button type="button" className={styles.primary} onClick={handleActionNext}>
              次へ
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && obstacle ? (
        <div className={styles.stepBlock}>
          <section className={styles.confirm} aria-label="送信内容の確認">
            <h2 className={styles.confirmTitle}>確認</h2>
            <p>
              <strong>障害:</strong> {obstacle.description}
            </p>
            <p>
              <strong>領域:</strong> {domainToLabel(obstacle.domain)}
            </p>
            <p>
              <strong>ストレス:</strong> {obstacle.stressLevel}
            </p>
            {obstacle.goal ? <p><strong>ゴール:</strong> {obstacle.goal}</p> : null}
            {obstacle.emotion ? <p><strong>感情:</strong> {obstacle.emotion}</p> : null}
            {obstacle.context ? <p><strong>状況:</strong> {obstacle.context}</p> : null}
            <p>
              <strong>行動:</strong>{' '}
              {actionResult === 'CONFRONTED' ? '向き合った' : '回避した'}
            </p>
            {actionBody ? <p><strong>実際の行動:</strong> {actionBody}</p> : null}
            {actionText ? (
              <p>
                <strong>メモ:</strong> {actionText}
              </p>
            ) : null}
          </section>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setStep(2)}>
              戻る
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={handleSubmit}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? '送信中...' : '送信する'}
            </button>
          </div>
        </div>
      ) : null}

      <p
        className={styles.liveRegion}
        aria-live="polite"
        style={{
          color: messageType === 'error' ? '#dc2626' : '#15803d',
          backgroundColor: messageType === 'error' ? '#fee2e2' : '#dcfce7',
        }}
      >
        {statusMessage}
  </p>

      {messageType === 'success' && statusMessage ? (
        <div className={styles.evidenceDraftBox}>
          <p className={styles.evidenceDraftLabel}>次のステップ</p>
          <p className={styles.evidenceDraftText}>記録を追加したら、仮説を更新して見直してください。</p>
          <div className={styles.evidenceDraftActions}>
            <Link href="/persona" className={styles.evidenceDraftLink}>
              仮説を更新
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
