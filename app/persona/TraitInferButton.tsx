'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadLMConfig } from '@/lib/lmConfig';
import styles from './page.module.css';

export default function TraitInferButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleInfer() {
    const cfg = loadLMConfig();
    if (!cfg) {
      setMessage({ type: 'error', text: 'LM設定が見つかりません。設定ページでLMプロバイダーを設定してください。' });
      return;
    }

    setIsPending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/traits/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lmConfig: cfg }),
      });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? '推論に失敗しました');
      setMessage({ type: 'success', text: json.message ?? '推論が完了しました' });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '推論に失敗しました' });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.inferBtn}
        onClick={handleInfer}
        disabled={isPending}
      >
        {isPending ? '推論中...' : 'トレイト推論を実行'}
      </button>
      {message && (
        <div className={message.type === 'success' ? styles.successBox : styles.errorBox}>
          {message.text}
        </div>
      )}
    </>
  );
}
