'use client';

import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import styles from './page.module.css';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const supabase = createSupabaseBrowserClient();

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setMessage('確認メールを送信しました。メールのリンクをクリックしてください。');
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
      } else {
        window.location.href = '/';
      }
    }

    setLoading(false);
  }

  return (
    <>
      <Header />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>
            {mode === 'login' ? 'ログイン' : 'アカウント作成'}
          </h1>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.group}>
              <label htmlFor="email" className={styles.label}>メールアドレス</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                required
                autoComplete="email"
              />
            </div>

            <div className={styles.group}>
              <label htmlFor="password" className={styles.label}>パスワード</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && <p className={styles.error} role="alert">{error}</p>}
            {message && <p className={styles.success} role="status">{message}</p>}

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading
                ? '処理中...'
                : mode === 'login'
                  ? 'ログイン'
                  : 'アカウント作成'}
            </button>
          </form>

          <button
            type="button"
            className={styles.toggle}
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'login'
              ? 'アカウントをお持ちでない方はこちら'
              : 'すでにアカウントをお持ちの方はこちら'}
          </button>
        </section>
      </main>
      <Footer />
    </>
  );
}
