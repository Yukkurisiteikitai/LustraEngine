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
  const experiences = await experience.findAllByUser(user.id);

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.stack}>
          <LogsClient experiences={experiences} />
        </div>
      </main>
      <Footer />
    </>
  );
}
