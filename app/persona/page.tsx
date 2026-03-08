import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TraitBar from '@/components/TraitBar';
import TraitInferButton from './TraitInferButton';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import type { TraitName } from '@/types';
import styles from './page.module.css';

const TRAIT_LABELS: Record<TraitName, string> = {
  introversion: '内向性',
  discipline: '自律性',
  curiosity: '好奇心',
  risk_tolerance: 'リスク許容度',
  self_criticism: '自己批判',
  social_anxiety: '社会不安',
};

const CLUSTER_LABELS: Record<string, string> = {
  procrastination: '先延ばし',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

const DOMAIN_LABELS: Record<string, string> = {
  WORK: '仕事',
  RELATIONSHIP: '人間関係',
  HEALTH: '健康',
  MONEY: 'お金',
  SELF: '自己',
};

const TRAIT_ORDER: TraitName[] = [
  'introversion',
  'discipline',
  'curiosity',
  'risk_tolerance',
  'self_criticism',
  'social_anxiety',
];

export default async function PersonaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { trait, persona } = createRepositories(supabase);
  const [traits, snapshot] = await Promise.all([
    trait.findByUser(user.id),
    persona.getLatest(user.id),
  ]);

  const traitMap =
    traits.length > 0
      ? (Object.fromEntries(traits.map((t) => [t.name, t.score])) as Record<TraitName, number>)
      : null;

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.title}>ペルソナ</h1>
            <TraitInferButton />
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>パーソナリティトレイト</h2>
            {!traitMap || Object.keys(traitMap).length === 0 ? (
              <p className={styles.empty}>
                まだトレイトがありません。パターン検出後に推論を実行してください。
              </p>
            ) : (
              <div className={styles.traitList}>
                {TRAIT_ORDER.map((name) => (
                  <TraitBar
                    key={name}
                    name={name}
                    label={TRAIT_LABELS[name]}
                    score={traitMap[name] ?? 0.5}
                  />
                ))}
              </div>
            )}
          </section>

          {snapshot?.personaJson && (
            <>
              {snapshot.personaJson.dominantClusters.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>主要な行動クラスター</h2>
                  <ul className={styles.clusterList}>
                    {snapshot.personaJson.dominantClusters.map((c) => (
                      <li key={c.type} className={styles.clusterItem}>
                        <span className={styles.clusterName}>
                          {CLUSTER_LABELS[c.type] ?? c.type}
                        </span>
                        <span className={styles.clusterCount}>{c.detectedCount}回</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {Object.keys(snapshot.personaJson.domainBreakdown).length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>ドメイン分布</h2>
                  <ul className={styles.domainList}>
                    {Object.entries(snapshot.personaJson.domainBreakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([domain, count]) => (
                        <li key={domain} className={styles.domainItem}>
                          <span>{DOMAIN_LABELS[domain] ?? domain}</span>
                          <span className={styles.domainCount}>{count}件</span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}

              <p className={styles.snapshotDate}>
                最終更新: {new Date(snapshot.createdAt).toLocaleString('ja-JP')}
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
