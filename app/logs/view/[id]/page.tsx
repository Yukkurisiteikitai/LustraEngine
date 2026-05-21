import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import LogViewActions from './LogViewActions';
import {
  formatArchiveDate,
  getActionLabel,
  getAgeBucket,
  AGE_BUCKET_LABELS,
  getVisibilityLabel,
} from '../../archiveUtils';
import styles from './page.module.css';

type LogViewPageProps = {
  params: Promise<{
    id: string;
  }>;
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

export default async function LogViewPage({ params }: LogViewPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { id } = await params;
  if (!id) notFound();

  const { experience } = createRepositories(supabase);
  const item = await experience.findById(user.id, id);
  if (!item) notFound();

  const ageBucket = AGE_BUCKET_LABELS[getAgeBucket(item.date)];

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.stack}>
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

            <LogViewActions experience={item} />
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
