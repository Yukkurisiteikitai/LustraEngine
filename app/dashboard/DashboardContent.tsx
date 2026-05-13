import ConfrontationChart from '@/components/ConfrontationChart';
import StressChart from '@/components/StressChart';
import ObstacleList from '@/components/ObstacleList';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadDashboardViewModel } from '@/container/loadAnalyticsViewModel';
import type { ObstacleRecord } from '@/types';
import styles from './page.module.css';

interface Props {
  userId: string;
}

export default async function DashboardContent({ userId }: Props) {
  const supabase = await createSupabaseServerClient();
  const viewModel = await loadDashboardViewModel(supabase, userId);
  const recentExperiences: ObstacleRecord[] = viewModel.recentObstacles.map((item) => ({
    id: item.id,
    date: item.createdAt,
    description: item.description,
    domain: item.domain as ObstacleRecord['domain'],
    stressLevel: item.stressLevel,
    actionResult: item.actionResult,
  }));

  return (
    <>
      <section className={styles.grid}>
        <ConfrontationChart rate={viewModel.confrontRate} />
        <StressChart points={viewModel.stressTrend} />
      </section>

      <ObstacleList items={recentExperiences} />
    </>
  );
}
