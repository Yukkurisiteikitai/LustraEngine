import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TraitInferButton from './TraitInferButton';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import styles from './page.module.css';
import { buildUserModelSnapshot } from '@/application/mappers/UserModelSnapshotMapper';
import { buildFallbackUserSettings } from '@/core/domains/user-settings/UserSettings';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';

export default async function PersonaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { traitHypothesis, userSettings } = createRepositories(supabase);

  let settings = buildFallbackUserSettings(user.id);
  let settingsWarning: string | null = null;
  try {
    settings = await userSettings.ensureDefaultByUser(user.id);
  } catch (error) {
    console.error('persona_page_settings_load_failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    settingsWarning = 'ユーザー設定の読み込みに失敗したため、既定設定で表示しています。';
  }

  const allowSnapshotGeneration = settings.allowSnapshotGeneration ?? settings.allowModelSnapshotGeneration;

  if (!allowSnapshotGeneration) {
    const disabledSnapshot = buildUserModelSnapshot(user.id, [], {
      disabledMessage: 'ユーザーモデル要約の生成は無効です。設定で有効化すると仮説要約を表示できます。',
    });

    return (
      <>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.pageHeader}>
              <h1 className={styles.title}>ユーザーモデル</h1>
              <TraitInferButton disabled />
            </div>

            <p className={styles.pageLead}>
              直近の記録から仮説を更新し、その要約を表示します。ここは確定ではなく、Evidence 由来のモデル要約です。
            </p>

            <div className={styles.errorBox}>{disabledSnapshot.summaryText}</div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  let loadWarning: string | null = null;
  let hypotheses: TraitHypothesisRecord[] = [];
  try {
    hypotheses = await traitHypothesis.findActiveByUser(user.id);
  } catch (error) {
    console.error('persona_page_hypothesis_load_failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    loadWarning = '仮説要約の読み込みに失敗しました。少し時間を置いて再読み込みしてください。';
  }

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

          <p className={styles.pageLead}>
            直近の記録から仮説を更新し、その要約を表示します。ここは確定ではなく、Evidence 由来のモデル要約です。
          </p>

          {settingsWarning ? <div className={styles.errorBox}>{settingsWarning}</div> : null}
          {loadWarning ? <div className={styles.errorBox}>{loadWarning}</div> : null}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>現在の仮説要約</h2>
            {snapshot.activeHypothesisCount === 0 ? (
              <p className={styles.empty}>
                まだ仮説は少なめです。記録を追加すると、ここに要約が並びます。
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
