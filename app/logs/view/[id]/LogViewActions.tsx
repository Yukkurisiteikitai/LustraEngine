'use client';

import { useState, useTransition } from 'react';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import { getVisibilityLabel } from '../../archiveUtils';
import styles from './page.module.css';

type Props = {
  experience: ExperienceData;
};

export default function LogViewActions({ experience }: Props) {
  const [item, setItem] = useState(experience);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  async function updateDisposition(action: 'soft_delete' | 'exclude') {
    setMessage('');
    try {
      const res = await fetch(`/api/logs/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { message?: string; ok?: boolean };
      if (!res.ok) {
        throw new Error(json.message ?? '更新に失敗しました');
      }
      setItem((current) =>
        action === 'soft_delete'
          ? {
              ...current,
              softDeletedAt: new Date().toISOString(),
            }
          : {
              ...current,
              visibility: 'excluded',
            },
      );
      setMessage(action === 'soft_delete' ? '記録を削除しました' : '記録を除外しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新に失敗しました');
    }
  }

  return (
    <section className={styles.actionPanel}>
      <div className={styles.actionHeader}>
        <div>
          <p className={styles.actionLabel}>操作</p>
          <h2 className={styles.sectionTitle}>この記録の扱いを調整する</h2>
        </div>
        <span className={styles.statusBadge}>
          {item.softDeletedAt ? 'soft_deleted' : getVisibilityLabel(item.visibility)}
        </span>
      </div>

      {message ? <p className={styles.notice}>{message}</p> : null}

      <div className={styles.actionButtons}>
        <button
          type="button"
          className={styles.secondary}
          disabled={isPending || Boolean(item.softDeletedAt)}
          onClick={() =>
            startTransition(() => {
              void updateDisposition('soft_delete');
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
              void updateDisposition('exclude');
            })
          }
        >
          除外する
        </button>
      </div>
    </section>
  );
}
