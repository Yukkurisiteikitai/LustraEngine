'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ObstacleForm, { type ObstacleDraft } from '@/components/ObstacleForm';
import ActionSelector from '@/components/ActionSelector';
import { useSubmitLogMutation } from '@/lib/mockQueryClient';
import { loadLMConfig } from '@/lib/lmConfig';
import type { ActionResult, Domain } from '@/types';
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

export default function LogNewPage() {
  const [step, setStep] = useState<Step>(1);
  const [obstacle, setObstacle] = useState<ConfirmObstacle | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | ''>('');
  const [actionBody, setActionBody] = useState('');
  const [actionText, setActionText] = useState('');
  const [actionError, setActionError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const mutation = useSubmitLogMutation();

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
          },
        ],
      },
      {
        onSuccess: (data) => {
          setMessageType('success');
          setStatusMessage(`${data.message}（向き合い率: ${data.summary.confrontationRate}%）`);
          // Fire-and-forget pattern detection
          const cfg = loadLMConfig();
          if (cfg) {
            void fetch('/api/patterns/detect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lmConfig: cfg }),
            }).catch((err) => console.warn('[LogNewPage] Pattern detection failed:', err));
          }
          // リセット
          setTimeout(() => {
            setStep(1);
            setObstacle(null);
            setActionResult('');
            setActionBody('');
            setActionText('');
            setStatusMessage('');
          }, 2000);
        },
        onError: (error) => {
          console.error('[LogNewPage] Mutation error:', error);
          const errorMsg = error instanceof Error ? error.message : '不明なエラーが発生しました';
          setMessageType('error');
          setStatusMessage(`エラー: ${errorMsg}`);
        },
      },
    );
  }

  return (
    <>
      <Header />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>今日の記録</h1>
          <p className={styles.progress}>Step {step} / 3</p>

          {step === 1 ? (
            <ObstacleForm onSubmit={handleObstacleSubmit} submitLabel="次へ" />
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
        </section>
      </main>
      <Footer />
    </>
  );
}
