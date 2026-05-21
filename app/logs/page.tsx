import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { redirect } from 'next/navigation';
import LogsClient from './LogsClient';
import styles from './page.module.css';

export default async function LogsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { experience } = createRepositories(supabase);
  const experiences = await experience.findRecent(user.id, 40);

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.stack}>
          <div className={styles.pageHeader}>
            <p className={styles.pageKicker}>Archive</p>
            <h1 className={styles.pageTitle}>記録を読み返す</h1>
            <p className={styles.pageIntro}>
              ここでは最近の記録を見ながら、全文検索で過去ログをたどれます。検索語を入れると、サーバー側で一致した記録だけを返します。
            </p>
          </div>
          <LogsClient experiences={experiences} />
        </div>
      </main>
      <Footer />
    </>
  );
}
