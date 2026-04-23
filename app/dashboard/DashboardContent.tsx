import ConfrontationChart from '@/components/ConfrontationChart';
import StressChart from '@/components/StressChart';
import ObstacleList from '@/components/ObstacleList';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createGetAnalyticsUseCase } from '@/container/createUseCases';
import type { ObstacleRecord } from '@/types';
import styles from './page.module.css';

interface Props {
  userId: string;
}

export default async function DashboardContent({ userId }: Props) {
  const supabase = await createSupabaseServerClient();
  const data = await createGetAnalyticsUseCase(supabase).execute(userId);

  return (
    <>
      <section className={styles.grid}>
        <ConfrontationChart rate={data.confrontationRate} />
        <StressChart points={data.stressTrend} />
      </section>

      <ObstacleList items={data.recentExperiences as unknown as ObstacleRecord[]} />
    </>
  );
}
