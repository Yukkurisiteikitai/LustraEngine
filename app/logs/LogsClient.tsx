'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import styles from './page.module.css';

type Props = {
  experiences: ExperienceData[];
};

export default function LogsClient({ experiences }: Props) {
  const [items, setItems] = useState(experiences);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  async function updateDisposition(id: string, action: 'soft_delete' | 'exclude') {
    setMessage('');
    try {
      const res = await fetch(`/api/logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { message?: string; ok?: boolean };
      if (!res.ok) {
        throw new Error(json.message ?? '更新に失敗しました');
      }
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                softDeletedAt: action === 'soft_delete' ? new Date().toISOString() : item.softDeletedAt,
                visibility: action === 'exclude' ? 'excluded' : item.visibility,
              }
            : item,
        ),
      );
      setMessage(action === 'soft_delete' ? '記録を削除しました' : '記録を除外しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新に失敗しました');
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>記録の管理</h2>
      <p className={styles.description}>
        削除は soft delete として扱われ、分析・要約から外れます。間違った記録は除外にもできます。
      </p>
      <div className={styles.actions}>
        <Link href="/api/export" className={styles.primary}>
          データを書き出す
        </Link>
        <Link href="/settings" className={styles.secondary}>
          設定に戻る
        </Link>
      </div>
      {message ? <p className={styles.notice}>{message}</p> : null}
      <div className={styles.list}>
        {items.map((item) => (
          <article key={item.id} className={styles.entry}>
            <div className={styles.entryHeader}>
              <strong>{item.date}</strong>
              <span>{item.visibility}</span>
              {item.softDeletedAt ? <span>soft_deleted</span> : null}
            </div>
            <p className={styles.entryText}>{item.description}</p>
            <div className={styles.entryActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={isPending || Boolean(item.softDeletedAt)}
                onClick={() =>
                  startTransition(() => {
                    void updateDisposition(item.id, 'soft_delete');
                  })
                }
              >
                記録を削除する
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={isPending || item.visibility === 'excluded'}
                onClick={() =>
                  startTransition(() => {
                    void updateDisposition(item.id, 'exclude');
                  })
                }
              >
                除外する
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
