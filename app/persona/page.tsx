import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TraitInferButton from './TraitInferButton';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import styles from './page.module.css';
import { buildUserModelSnapshot } from '@/application/mappers/UserModelSnapshotMapper';

export default async function PersonaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { traitHypothesis } = createRepositories(supabase);
  const hypotheses = await traitHypothesis.findActiveByUser(user.id);
  const snapshot = buildUserModelSnapshot(user.id, hypotheses);

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.title}>ユーザーモデル</h1>
            <TraitInferButton />
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>現在の仮説要約</h2>
            {snapshot.activeHypothesisCount === 0 ? (
              <p className={styles.empty}>
                まだ十分な仮説がありません。記録を追加するとモデル要約が更新されます。
              </p>
            ) : (
              <div className={styles.traitList}>
                {snapshot.topHypotheses.map((h) => (
                  <div key={`${h.traitKey}-${h.hypothesisLabel}`} className={styles.clusterItem}>
                    <span className={styles.clusterName}>{h.hypothesisText}</span>
                    <span className={styles.clusterCount}>
                      {Math.round(h.confidence * 100)}% / {Math.round(h.uncertainty * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>モデル要約</h2>
            <p className={styles.empty}>{snapshot.summaryText}</p>
            <p className={styles.snapshotDate}>
              最終生成: {new Date(snapshot.createdAt).toLocaleString('ja-JP')}
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
