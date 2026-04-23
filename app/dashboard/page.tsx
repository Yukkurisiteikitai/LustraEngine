import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PsychologySection from './PsychologySection';
import DashboardContent from './DashboardContent';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import styles from './page.module.css';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.title}>ダッシュボード</h1>

        <Suspense fallback={<div style={{ color: '#6b7280' }}>読み込み中...</div>}>
          <DashboardContent userId={user.id} />
        </Suspense>

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
