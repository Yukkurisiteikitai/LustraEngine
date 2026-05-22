'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import {
  formatArchiveDate,
  getActionLabel,
  getAgeBucket,
  AGE_BUCKET_LABELS,
  getVisibilityLabel,
} from '../../archiveUtils';
import styles from './page.module.css';

type Props = {
  experience: ExperienceData;
};

function getDomainLabel(domainKey?: string) {
  switch (domainKey) {
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
      return domainKey ?? '未分類';
  }
}

function fieldValue(value?: string | null) {
  return value && value.trim() ? value : '未入力';
}

export default function LogViewClient({ experience }: Props) {
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

  const ageBucket = AGE_BUCKET_LABELS[getAgeBucket(item.date)];

  return (
    <>
      <Link href="/logs" className={styles.backLink}>
        ← 記録一覧へ戻る
      </Link>

      <article className={styles.card}>
        <div className={styles.hero}>
          <div className={styles.metaRow}>
            <span className={styles.metaBadge}>{formatArchiveDate(item.date)}</span>
            <span className={styles.metaBadge}>{ageBucket}</span>
            <span className={styles.metaBadge}>{getDomainLabel(item.domainKey)}</span>
            <span className={styles.metaBadge}>Stress {item.stressLevel}</span>
            <span className={styles.metaBadge}>{getActionLabel(item.actionResult)}</span>
            <span className={styles.metaBadge}>{getVisibilityLabel(item.visibility)}</span>
            {item.softDeletedAt ? <span className={styles.metaBadge}>soft_deleted</span> : null}
          </div>

          <h1 className={styles.title}>{item.description}</h1>
          {item.source ? <p className={styles.source}>source: {item.source}</p> : null}
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>要約</h2>
          <p className={styles.description}>{item.description}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>詳細</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>ゴール</span>
              <p>{fieldValue(item.goal)}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>実際の行動</span>
              <p>{fieldValue(item.action)}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>感情</span>
              <p>{fieldValue(item.emotion)}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>状況</span>
              <p>{fieldValue(item.context)}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>メモ</span>
              <p>{fieldValue(item.actionMemo)}</p>
            </div>
          </div>
        </section>

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
      </article>
    </>
  );
}
