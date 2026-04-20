import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ConfrontationChart from '@/components/ConfrontationChart';
import StressChart from '@/components/StressChart';
import ObstacleList from '@/components/ObstacleList';
import PsychologySection from './PsychologySection';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createGetAnalyticsUseCase } from '@/container/createUseCases';
import type { ObstacleRecord } from '@/types';
import styles from './page.module.css';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const data = await createGetAnalyticsUseCase(supabase).execute(user.id);

  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.title}>ダッシュボード</h1>

        <section className={styles.grid}>
          <ConfrontationChart rate={data.confrontationRate} />
          <StressChart points={data.stressTrend} />
        </section>

        <ObstacleList items={data.recentExperiences as unknown as ObstacleRecord[]} />

        <section>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 700 }}>
            あなたの傾向
          </h2>
          <Suspense fallback={<div style={{ color: '#6b7280' }}>分析中...</div>}>
            <PsychologySection userId={user.id} />
          </Suspense>
        </section>
      </main>
      <Footer />
    </>
  );
}
