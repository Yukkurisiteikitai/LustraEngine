import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { buildFallbackUserSettings } from '@/core/domains/user-settings/UserSettings';
import LogNewClient from './LogNewClient';
import styles from './page.module.css';

type LogNewPageProps = {
  searchParams?: Promise<{
    template?: string;
    questions?: string;
  }>;
};

export default async function LogNewPage({ searchParams: _searchParams }: LogNewPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { userSettings } = createRepositories(supabase);
  let settings = buildFallbackUserSettings(user.id);
  try {
    settings = await userSettings.ensureDefaultByUser(user.id);
  } catch (error) {
    console.error('log_new_page_settings_load_failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <>
      <Header />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>今日の記録</h1>
          <p className={styles.intro}>
            ここでは出来事を記録します。書き終えたら、そのまま仮説更新へ戻れます。
          </p>
          <LogNewClient allowChatFallbackDraft={settings.allowChatFallbackDraft} />
        </section>
      </main>
      <Footer />
    </>
  );
}
