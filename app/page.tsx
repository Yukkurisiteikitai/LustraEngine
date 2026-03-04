import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SummaryCard from '@/components/SummaryCard';
import styles from './page.module.css';

const summary = {
  confrontationRate: 62,
  avgStress7Days: 3.1,
  streakDays: 4,
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.title}>今日の一歩を、明日の自信に。</h1>
          <p className={styles.subtitle}>60秒で、今日の障害と行動を記録できます。</p>
          <Link href="/log/new" className={styles.cta}>
            今日を記録する
          </Link>
        </section>

        <section className={styles.summary} aria-label="最近のサマリー">
          <SummaryCard title="向き合い率" value={`${summary.confrontationRate}%`} note="直近7日" />
          <SummaryCard title="平均ストレス" value={`${summary.avgStress7Days}`} note="直近7日" />
          <SummaryCard title="連続記録" value={`${summary.streakDays}日`} note="継続中" />
        </section>
      </main>
      <Footer />
    </>
  );
}
