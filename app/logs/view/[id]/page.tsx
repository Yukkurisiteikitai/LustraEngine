import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import LogViewClient from './LogViewClient';
import styles from './page.module.css';

type LogViewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LogViewPage({ params }: LogViewPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { id } = await params;
  if (!id) notFound();

  const { experience } = createRepositories(supabase);
  const item = await experience.findById(user.id, id);
  if (!item) notFound();

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.stack}>
          <LogViewClient experience={item} />
        </div>
      </main>
      <Footer />
    </>
  );
}
