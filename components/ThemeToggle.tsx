'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={styles.placeholder} />;
  }

  const cycleTheme = () => {
    const nextTheme = {
      system: 'light',
      light: 'dark',
      dark: 'system',
    }[theme || 'system'] || 'system';
    setTheme(nextTheme);
  };

  const getIcon = () => {
    switch (theme) {
      case 'light': return '☀';
      case 'dark': return '☾';
      default: return '◐';
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      default: return 'Auto';
    }
  };

  return (
    <button
      className={styles.toggle}
      onClick={cycleTheme}
      aria-label={`テーマ切り替え: 現在は${getLabel()}`}
      title="Auto / Light / Dark"
    >
      <span className={styles.icon}>{getIcon()}</span>
      <span className={styles.label}>{getLabel()}</span>
    </button>
  );
}
