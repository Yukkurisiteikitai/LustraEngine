import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PatternDetectButton from './PatternDetectButton';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import type { ClusterType, EpisodeCluster, ExperienceClusterMap } from '@/types';
import styles from './page.module.css';

const CLUSTER_LABELS: Record<ClusterType, string> = {
  procrastination: '先延ばし',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

const CLUSTER_COLORS: Record<ClusterType, string> = {
  procrastination: '#f59e0b',
  social_avoidance: '#6366f1',
  authority_anxiety: '#ef4444',
  perfectionism: '#10b981',
};

function StrengthDots({ strength }: { strength: number }) {
  return (
    <div className={styles.dots} aria-label={`強度: ${strength}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={styles.dot}
          style={{ background: i < strength ? 'currentColor' : 'var(--border, #e5e7eb)' }}
        />
      ))}
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: EpisodeCluster }) {
  const color = CLUSTER_COLORS[cluster.clusterType] ?? '#9ca3af';
  return (
    <article className={styles.clusterCard} style={{ borderLeftColor: color }}>
      <div className={styles.clusterHeader}>
        <span className={styles.clusterBadge} style={{ background: color }}>
          {CLUSTER_LABELS[cluster.clusterType] ?? cluster.clusterType}
        </span>
        <span className={styles.clusterCount}>{cluster.detectedCount}回検出</span>
      </div>
      <h2 className={styles.clusterLabel}>{cluster.label}</h2>
      {cluster.description && (
        <p className={styles.clusterDescription}>{cluster.description}</p>
      )}
      <div className={styles.clusterMeta}>
        <span className={styles.strengthLabel}>強度</span>
        <StrengthDots strength={cluster.strength} />
      </div>
    </article>
  );
}

function MappingRow({ mapping }: { mapping: ExperienceClusterMap }) {
  const color = mapping.clusterType ? CLUSTER_COLORS[mapping.clusterType] : '#9ca3af';
  const confidence = mapping.confidence != null ? Math.round(mapping.confidence * 100) : null;

  return (
    <li className={styles.mappingRow}>
      <div className={styles.mappingTop}>
        <p className={styles.mappingDesc}>{mapping.experienceDescription ?? '(記録なし)'}</p>
        <div className={styles.mappingMeta}>
          {mapping.clusterLabel && (
            <span className={styles.mappingBadge} style={{ background: color }}>
              {mapping.clusterLabel}
            </span>
          )}
          {confidence != null && <span className={styles.mappingConf}>{confidence}%</span>}
        </div>
      </div>
      {mapping.reasoning && <p className={styles.mappingReasoning}>{mapping.reasoning}</p>}
    </li>
  );
}

export default async function PatternsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { clusterQuery } = createRepositories(supabase);
  const clusters = await clusterQuery.findByUser(user.id);

  const { data: rawMappings } = await supabase
    .from('experience_cluster_map')
    .select(`
      id, experience_id, cluster_id, confidence, reasoning, created_at,
      episode_clusters ( cluster_type, label ),
      experiences ( description )
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  const recentMappings: ExperienceClusterMap[] = (rawMappings ?? []).map((m) => {
    const clusterJoin = (m.episode_clusters as unknown) as
      | { cluster_type: string; label: string }
      | null;
    const expJoin = (m.experiences as unknown) as { description: string } | null;
    return {
      id: m.id as string,
      experienceId: m.experience_id as string,
      clusterId: m.cluster_id as string,
      confidence: m.confidence as number | null,
      reasoning: m.reasoning as string | null,
      createdAt: m.created_at as string,
      clusterType: clusterJoin?.cluster_type as ClusterType | undefined,
      clusterLabel: clusterJoin?.label,
      experienceDescription: expJoin?.description,
    };
  });

  const episodeClusters: EpisodeCluster[] = clusters.map((c) => ({
    id: c.id,
    userId: c.userId,
    clusterType: c.clusterType,
    label: c.label,
    description: c.description,
    strength: c.strength,
    detectedCount: c.detectedCount,
    lastDetectedAt: c.lastDetectedAt,
    createdAt: '',
    updatedAt: '',
  }));

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.title}>行動パターン</h1>
            <PatternDetectButton />
          </div>

          <section>
            <h2 className={styles.sectionTitle}>検出されたクラスター</h2>
            {episodeClusters.length === 0 ? (
              <p className={styles.empty}>
                まだパターンが検出されていません。記録を追加して分析を実行してください。
              </p>
            ) : (
              <div className={styles.clusterGrid}>
                {episodeClusters.map((cluster) => (
                  <ClusterCard key={cluster.id} cluster={cluster} />
                ))}
              </div>
            )}
          </section>

          {recentMappings.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>最近の分類結果</h2>
              <ul className={styles.mappingList}>
                {recentMappings.map((m) => (
                  <MappingRow key={m.id} mapping={m} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
