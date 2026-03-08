'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadLMConfig } from '@/lib/lmConfig';
import styles from './page.module.css';

export default function PatternDetectButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleDetect() {
    const cfg = loadLMConfig();
    if (!cfg) {
      setMessage({ type: 'error', text: 'LM設定が見つかりません。設定ページでLMプロバイダーを設定してください。' });
      return;
    }

    setIsPending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/patterns/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lmConfig: cfg }),
      });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? '分析に失敗しました');
      setMessage({ type: 'success', text: json.message ?? '分析が完了しました' });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '分析に失敗しました' });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.analyzeBtn}
        onClick={handleDetect}
        disabled={isPending}
      >
        {isPending ? '分析中...' : 'パターンを分析'}
      </button>
      {message && (
        <div className={message.type === 'success' ? styles.successBox : styles.errorBox}>
          {message.text}
        </div>
      )}
    </>
  );
}
