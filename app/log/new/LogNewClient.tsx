'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DiaryInputStep from '@/components/log/DiaryInputStep';
import ExtractedConfirmStep, { type ConfirmDraft } from '@/components/log/ExtractedConfirmStep';
import TriggerFollowupStep from '@/components/log/TriggerFollowupStep';
import {
  useExtractDiaryMutation,
  useSubmitLogMutation,
  type ExtractedDiaryFields,
} from '@/lib/mockQueryClient';
import {
  consumeEvidenceLoggingDraft,
  clearEvidenceLoggingDraft,
  type EvidenceLoggingDraft,
} from '@/lib/evidenceDraftStorage';
import styles from './page.module.css';

type Stage = 'diary' | 'confirm' | 'trigger';

interface LogNewClientProps {
  evidenceTemplate?: string;
  evidenceQuestions?: string[];
  source?: 'chat_fallback' | 'manual';
  allowChatFallbackDraft?: boolean;
}

const STAGE_INDEX: Record<Stage, number> = { diary: 1, confirm: 2, trigger: 3 };

export default function LogNewClient({
  evidenceTemplate = '',
  evidenceQuestions = [],
  source = 'manual',
  allowChatFallbackDraft = true,
}: LogNewClientProps) {
  const [stage, setStage] = useState<Stage>('diary');
  const [diaryText, setDiaryText] = useState('');
  const [extracted, setExtracted] = useState<ExtractedDiaryFields | null>(null);
  const [draft, setDraft] = useState<ConfirmDraft | null>(null);
  const [triggerAnswer, setTriggerAnswer] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [restoredDraft, setRestoredDraft] = useState<EvidenceLoggingDraft | null>(null);

  const extractMutation = useExtractDiaryMutation();
  const saveMutation = useSubmitLogMutation();

  useEffect(() => {
    if (!allowChatFallbackDraft) {
      clearEvidenceLoggingDraft();
      return;
    }
    const d = consumeEvidenceLoggingDraft();
    if (d) {
      setRestoredDraft(d);
      if (d.template) setDiaryText(d.template);
    }
  }, [allowChatFallbackDraft]);

  useEffect(() => {
    if (evidenceTemplate && !diaryText) {
      setDiaryText(evidenceTemplate);
    }
  }, [evidenceTemplate, diaryText]);

  const activeSource = restoredDraft?.source ?? source;
  const activeQuestions = restoredDraft?.questions ?? evidenceQuestions;
  const activeTemplate = restoredDraft?.template ?? evidenceTemplate;

  function handleExtract() {
    extractMutation.mutate(diaryText, {
      onSuccess: (result) => {
        setExtracted(result);
        setDraft({
          description: result.description,
          context: result.context,
          domain: '',
          emotions: result.emotions,
          actionResult: result.actionResult,
          timeOfDay: result.timeOfDay,
          durationMinutes: result.durationMinutes,
          stressLevel: 3,
        });
        setTriggerAnswer('');
        setStage('confirm');
        setStatusMessage('');
      },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : 'AIによる読み取りに失敗しました';
        setMessageType('error');
        setStatusMessage(msg);
      },
    });
  }

  function persist(finalTrigger: string | null) {
    if (!draft || !extracted) return;
    if (draft.domain === '') {
      setMessageType('error');
      setStatusMessage('領域を選択してください');
      return;
    }
    saveMutation.mutate(
      {
        date: new Date().toISOString().slice(0, 10),
        obstacles: [
          {
            description: draft.description,
            domain: draft.domain,
            stressLevel: draft.stressLevel,
            actionResult: draft.actionResult,
            emotions: draft.emotions,
            context: draft.context || undefined,
            trigger: finalTrigger || extracted.trigger || undefined,
            timeOfDay: draft.timeOfDay,
            durationMinutes: draft.durationMinutes ?? undefined,
            ...(activeSource === 'chat_fallback' ? { source: 'chat_fallback' } : {}),
          },
        ],
      },
      {
        onSuccess: () => {
          setMessageType('success');
          setStatusMessage('記録しました。');
          setTimeout(() => {
            setStage('diary');
            setDiaryText('');
            setExtracted(null);
            setDraft(null);
            setTriggerAnswer('');
            setStatusMessage('');
          }, 2000);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : '不明なエラーが発生しました';
          setMessageType('error');
          setStatusMessage(`エラー: ${msg}`);
        },
      },
    );
  }

  const needsTriggerFollowup =
    !!extracted &&
    extracted.needsTriggerQuestion &&
    !!extracted.triggerQuestion &&
    !extracted.trigger;

  return (
    <>
      {activeTemplate ? (
        <div className={styles.evidenceDraftBox}>
          <p className={styles.evidenceDraftLabel}>Chat からの下書き</p>
          <p className={styles.evidenceDraftMeta}>
            evidenceType: {activeSource === 'chat_fallback' ? 'chat_fallback' : 'manual'}
          </p>
          <p className={styles.evidenceDraftText}>{activeTemplate}</p>
          {activeQuestions.length > 0 ? (
            <ul className={styles.evidenceDraftList}>
              {activeQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className={styles.progress}>Step {STAGE_INDEX[stage]} / 3</p>

      {stage === 'diary' ? (
        <DiaryInputStep
          value={diaryText}
          onChange={setDiaryText}
          onExtract={handleExtract}
          isExtracting={extractMutation.isPending}
          errorMessage={
            messageType === 'error' && statusMessage && !extracted ? statusMessage : null
          }
        />
      ) : null}

      {stage === 'confirm' && draft ? (
        <ExtractedConfirmStep
          draft={draft}
          onChange={setDraft}
          onBack={() => {
            setStage('diary');
            setExtracted(null);
            setDraft(null);
            setTriggerAnswer('');
            setMessageType('success');
            setStatusMessage('');
          }}
          onNext={() => setStage('trigger')}
          onSaveDirect={() => persist(null)}
          isSaving={saveMutation.isPending}
          needsTriggerFollowup={needsTriggerFollowup}
        />
      ) : null}

      {stage === 'trigger' && extracted?.triggerQuestion ? (
        <TriggerFollowupStep
          question={extracted.triggerQuestion}
          value={triggerAnswer}
          onChange={setTriggerAnswer}
          onSkip={() => persist(null)}
          onSave={() => persist(triggerAnswer.trim() || null)}
          isSaving={saveMutation.isPending}
        />
      ) : null}

      {statusMessage ? (
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
      ) : null}

      {messageType === 'success' && statusMessage ? (
        <div className={styles.evidenceDraftBox}>
          <p className={styles.evidenceDraftLabel}>次のステップ</p>
          <p className={styles.evidenceDraftText}>
            記録を追加したら、必要に応じて仮説を更新して見直してください。
          </p>
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
