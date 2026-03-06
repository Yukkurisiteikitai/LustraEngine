'use client';

import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { usePatterns, usePatternDetection } from '@/lib/mockQueryClient';
import { loadLMConfig } from '@/lib/lmConfig';
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
          {confidence != null && (
            <span className={styles.mappingConf}>{confidence}%</span>
          )}
        </div>
      </div>
      {mapping.reasoning && (
        <p className={styles.mappingReasoning}>{mapping.reasoning}</p>
      )}
    </li>
  );
}

export default function PatternsPage() {
  const { data, isLoading, error } = usePatterns();
  const detection = usePatternDetection();
  const hasConfig = typeof window !== 'undefined' && loadLMConfig() !== null;

  function handleDetect() {
    detection.mutate();
  }

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.title}>行動パターン</h1>
            <button
              type="button"
              className={styles.analyzeBtn}
              onClick={handleDetect}
              disabled={detection.isPending || !hasConfig}
              title={!hasConfig ? 'まず設定ページでLMプロバイダーを設定してください' : undefined}
            >
              {detection.isPending ? '分析中...' : 'パターンを分析'}
            </button>
          </div>

          {!hasConfig && (
            <div className={styles.warningBox}>
              <p>
                AIプロバイダーが設定されていません。
                <Link href="/settings" className={styles.settingsLink}>
                  設定ページ
                </Link>
                でLMプロバイダーを設定してください。
              </p>
            </div>
          )}

          {detection.error && (
            <div className={styles.errorBox}>
              {detection.error instanceof Error
                ? detection.error.message
                : '分析に失敗しました'}
            </div>
          )}

          {detection.isSuccess && (
            <div className={styles.successBox}>
              {(detection.data as { message?: string }).message ?? '分析が完了しました'}
            </div>
          )}

          {isLoading && <p className={styles.loading}>読み込み中...</p>}
          {error && (
            <p className={styles.errorBox}>
              {error instanceof Error ? error.message : '読み込みに失敗しました'}
            </p>
          )}

          {data && (
            <>
              <section>
                <h2 className={styles.sectionTitle}>検出されたクラスター</h2>
                {data.clusters.length === 0 ? (
                  <p className={styles.empty}>まだパターンが検出されていません。記録を追加して分析を実行してください。</p>
                ) : (
                  <div className={styles.clusterGrid}>
                    {data.clusters.map((cluster) => (
                      <ClusterCard key={cluster.id} cluster={cluster} />
                    ))}
                  </div>
                )}
              </section>

              {data.recentMappings.length > 0 && (
                <section>
                  <h2 className={styles.sectionTitle}>最近の分類結果</h2>
                  <ul className={styles.mappingList}>
                    {data.recentMappings.map((m) => (
                      <MappingRow key={m.id} mapping={m} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
