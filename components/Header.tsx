import Link from 'next/link';
import styles from './Header.module.css';

export default function Header() {
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
        </nav>
      </div>
    </header>
  );
}
