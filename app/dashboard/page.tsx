import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ConfrontationChart from '@/components/ConfrontationChart';
import StressChart from '@/components/StressChart';
import ObstacleList from '@/components/ObstacleList';
import type { ObstacleRecord } from '@/types';
import styles from './page.module.css';

const confrontationRate = 68;
const stressTrend = [4, 3, 4, 3, 2, 3, 2];

const recentObstacles: ObstacleRecord[] = [
  {
    id: 'r1',
    date: '2026-03-04',
    description: '会議で意見を伝えることに挑戦した',
    domain: 'WORK',
    stressLevel: 4,
    actionResult: 'CONFRONTED',
  },
  {
    id: 'r2',
    date: '2026-03-03',
    description: '運動の再開を先送りした',
    domain: 'HEALTH',
    stressLevel: 3,
    actionResult: 'AVOIDED',
  },
  {
    id: 'r3',
    date: '2026-03-02',
    description: '家計簿を10分だけ更新した',
    domain: 'MONEY',
    stressLevel: 2,
    actionResult: 'CONFRONTED',
  },
];

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.title}>ダッシュボード</h1>

        <section className={styles.grid}>
          <ConfrontationChart rate={confrontationRate} />
          <StressChart points={stressTrend} />
        </section>

        <ObstacleList items={recentObstacles} />
      </main>
      <Footer />
    </>
  );
}
