import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import LogNewClient from './LogNewClient';
import styles from './page.module.css';

type LogNewPageProps = {
  searchParams?: Promise<{
    template?: string;
    questions?: string;
  }>;
};

export default async function LogNewPage({ searchParams }: LogNewPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <>
      <Header />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>今日の記録</h1>
          <LogNewClient />
        </section>
      </main>
      <Footer />
    </>
  );
}
