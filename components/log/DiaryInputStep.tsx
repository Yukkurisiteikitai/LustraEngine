'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './logSteps.module.css';

// Minimal local typings for Web Speech API (not in lib.dom.d.ts as a stable interface).
// Only the surface we touch.
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>>;
  resultIndex: number;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface DiaryInputStepProps {
  value: string;
  onChange: (next: string) => void;
  onExtract: () => void;
  isExtracting: boolean;
  errorMessage?: string | null;
}

export default function DiaryInputStep({
  value,
  onChange,
  onExtract,
  isExtracting,
  errorMessage,
}: DiaryInputStepProps) {
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const baseTextRef = useRef<string>('');

  useEffect(() => {
    setVoiceSupported(getRecognitionCtor() !== null);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    baseTextRef.current = value ? `${value.trimEnd()} ` : '';
    const rec = new Ctor();
    rec.lang = 'ja-JP';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev) => {
      let appended = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const alt = ev.results[i][0];
        if (alt) appended += alt.transcript;
      }
      onChange(baseTextRef.current + appended);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [onChange, value]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const canSubmit = value.trim().length >= 4 && !isExtracting;

  return (
    <section className={styles.section} aria-label="step 1 — 日記を書く">
      <p className={styles.helper}>
        今日あったことを、文章のままで書いてください。AIが感情・結果・きっかけを読み取ります。
      </p>

      <div className={styles.toolbar}>
        {voiceSupported ? (
          <button
            type="button"
            className={styles.micButton}
            data-active={listening || undefined}
            onClick={listening ? stopListening : startListening}
            disabled={isExtracting}
          >
            {listening ? '⏹ 停止' : '🎤 音声で話す'}
          </button>
        ) : (
          <span className={styles.helper}>
            音声入力はこのブラウザでは未対応です（Chrome / Edge のみ）。
          </span>
        )}
      </div>

      <textarea
        className={styles.diaryArea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'例: スタバで2時間レポートやった。550円分は絶対回収してやるって気持ちで集中できた。国語のレポート2個終わって爽快だった。'}
        maxLength={2000}
        disabled={isExtracting}
      />

      {errorMessage ? <p className={styles.errorBox}>{errorMessage}</p> : null}

      <button
        type="button"
        onClick={onExtract}
        disabled={!canSubmit}
        style={{
          padding: '0.85rem 1.5rem',
          borderRadius: 999,
          border: 0,
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : 0.6,
        }}
      >
        {isExtracting ? '読み取り中…' : '✨ AIに読み取ってもらう'}
      </button>
    </section>
  );
}
