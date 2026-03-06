'use client';

import Link from 'next/link';
import { useAuth } from '@/app/providers';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './Header.module.css';

export default function Header() {
  const { user, loading } = useAuth();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Lustra
        </Link>
        <nav className={styles.nav} aria-label="グローバルナビゲーション">
          <Link href="/">ホーム</Link>
          <Link href="/log/new">記録</Link>
          <Link href="/dashboard">ダッシュボード</Link>
          <Link href="/patterns">パターン</Link>
          <Link href="/persona">ペルソナ</Link>
          <Link href="/chat">チャット</Link>
          <Link href="/settings">設定</Link>
          {!loading && user && (
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              ログアウト
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
