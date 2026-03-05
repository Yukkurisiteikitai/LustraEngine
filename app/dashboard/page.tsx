'use client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ConfrontationChart from '@/components/ConfrontationChart';
import StressChart from '@/components/StressChart';
import ObstacleList from '@/components/ObstacleList';
import { useAnalytics } from '@/lib/mockQueryClient';
import type { ObstacleRecord } from '@/types';
import styles from './page.module.css';

export default function DashboardPage() {
  const { data, isLoading, error } = useAnalytics();

  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.title}>ダッシュボード</h1>

        {isLoading && <p>読み込み中...</p>}
        {error && <p className={styles.error}>エラー: {error.message}</p>}

        {data && (
          <>
            <section className={styles.grid}>
              <ConfrontationChart rate={data.confrontationRate} />
              <StressChart points={data.stressTrend} />
            </section>

            <ObstacleList items={data.recentExperiences as ObstacleRecord[]} />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
