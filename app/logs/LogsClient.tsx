'use client';

import { type FormEvent, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import {
  LOG_SEARCH_FIELDS,
  LOG_SEARCH_FIELD_LABELS,
  type LogSearchField,
} from '@/application/search/logSearch';
import {
  AGE_BUCKET_LABELS,
  buildPreviewText,
  formatArchiveDate,
  getActionLabel,
  groupArchiveExperiences,
  getVisibilityLabel,
  type ArchiveExperience,
} from './archiveUtils';
import styles from './page.module.css';

type SearchResult = {
  experience: ExperienceData;
  matchedField: LogSearchField;
  searchRank: number;
};

type Props = {
  experiences: ExperienceData[];
};

function toArchiveExperiences(experiences: ExperienceData[]): ArchiveExperience[] {
  return experiences.map((experience) => ({
    ...experience,
    matchedField: 'description',
    searchRank: 0,
  }));
}

function getFieldLabel(field?: LogSearchField) {
  return field ? LOG_SEARCH_FIELD_LABELS[field] : LOG_SEARCH_FIELD_LABELS.description;
}

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

export default function LogsClient({ experiences }: Props) {
  const initialItems = useMemo(() => toArchiveExperiences(experiences), [experiences]);
  const [items, setItems] = useState<ArchiveExperience[]>(initialItems);
  const [query, setQuery] = useState('');
  const [field, setField] = useState<LogSearchField>('description');
  const [message, setMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => groupArchiveExperiences(items), [items]);

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

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setItems(initialItems);
      setMessage('検索語を入力してください');
      return;
    }

    setIsSearching(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        q: trimmed,
        field,
        limit: '50',
      });
      const res = await fetch(`/api/logs/search?${params.toString()}`);
      const json = (await res.json()) as {
        items?: SearchResult[];
        message?: string;
      };
      if (!res.ok) {
        throw new Error(json.message ?? '検索に失敗しました');
      }

      const nextItems =
        json.items?.map((item) => ({
          ...item.experience,
          matchedField: item.matchedField,
          searchRank: item.searchRank,
        })) ?? [];
      setItems(nextItems);
      setMessage(
        nextItems.length > 0
          ? `${nextItems.length}件見つかりました。`
          : '一致する記録は見つかりませんでした。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '検索に失敗しました');
    } finally {
      setIsSearching(false);
    }
  }

  function resetArchive() {
    setQuery('');
    setField('description');
    setItems(initialItems);
    setMessage('最新の記録に戻しました');
  }

  return (
    <section className={styles.archive}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Archive</p>
          <h1 className={styles.title}>過去ログ</h1>
          <p className={styles.description}>
            検索語を入れると、サーバー側で全文検索して一致した記録だけを表示します。詳細は各カードから開けます。
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/log/new" className={styles.primary}>
            新しく記録する
          </Link>
          <button type="button" className={styles.secondary} onClick={resetArchive}>
            最新に戻す
          </button>
        </div>
      </header>

      <form className={styles.searchPanel} onSubmit={handleSearch}>
        <label className={styles.searchField}>
          <span>検索窓</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例: 会議, 不安, 先延ばし"
          />
        </label>

        <label className={styles.searchField}>
          <span>項目</span>
          <select value={field} onChange={(event) => setField(event.target.value as LogSearchField)}>
            {LOG_SEARCH_FIELDS.map((option) => (
              <option key={option} value={option}>
                {LOG_SEARCH_FIELD_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className={styles.primary} disabled={isSearching}>
          {isSearching ? '検索中...' : '検索する'}
        </button>
      </form>

      <p className={styles.notice}>{message || `${items.length}件を表示中`}</p>

      {groups.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>記録が見つかりません</h2>
          <p>検索語を変えるか、「最新に戻す」で最近の記録に戻してください。</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.bucket} className={styles.group}>
            <div className={styles.groupHeader}>
              <h2>{AGE_BUCKET_LABELS[group.bucket]}</h2>
              <span>{group.items.length}件</span>
            </div>

            <div className={styles.list}>
              {group.items.map((item) => (
                <article key={item.id} className={styles.entry}>
                  <div className={styles.entryTop}>
                    <div className={styles.entryMeta}>
                      <span>{formatArchiveDate(item.date)}</span>
                      <span>{getVisibilityLabel(item.visibility)}</span>
                      <span>領域: {getDomainLabel(item.domainKey)}</span>
                      <span>Stress {item.stressLevel}</span>
                      <span>{getActionLabel(item.actionResult)}</span>
                      {item.softDeletedAt ? <span>soft_deleted</span> : null}
                    </div>
                    <Link href={`/logs/view/${item.id}`} className={styles.detailLink}>
                      詳細を見る
                    </Link>
                  </div>

                  <p className={styles.entryDescription}>{item.description}</p>
                  <p className={styles.entryPreview}>
                    <strong>{getFieldLabel(item.matchedField)}</strong>
                    {' '}
                    {buildPreviewText(item, item.matchedField)}
                  </p>

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
        ))
      )}
    </section>
  );
}
