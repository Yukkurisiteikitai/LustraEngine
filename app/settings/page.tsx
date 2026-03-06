'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { loadLMConfig, saveLMConfig, clearLMConfig } from '@/lib/lmConfig';
import type { LMConfig, LMProvider } from '@/types';
import styles from './page.module.css';

export default function SettingsPage() {
  const [provider, setProvider] = useState<LMProvider>('claude');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [lmstudioEndpoint, setLmstudioEndpoint] = useState('http://localhost:1234');
  const [lmstudioApiKey, setLmstudioApiKey] = useState('');
  const [lmstudioModel, setLmstudioModel] = useState('');
  const [saved, setSaved] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<LMConfig | null>(null);

  useEffect(() => {
    const cfg = loadLMConfig();
    if (cfg) {
      setCurrentConfig(cfg);
      setProvider(cfg.provider);
      setClaudeApiKey(cfg.claudeApiKey ?? '');
      setLmstudioEndpoint(cfg.lmstudioEndpoint ?? 'http://localhost:1234');
      setLmstudioApiKey(cfg.lmstudioApiKey ?? '');
      setLmstudioModel(cfg.lmstudioModel ?? '');
    }
  }, []);

  function handleSave() {
    const config: LMConfig = {
      provider,
      ...(provider === 'claude'
        ? { claudeApiKey: claudeApiKey.trim() || undefined }
        : {
            lmstudioEndpoint: lmstudioEndpoint.trim() || undefined,
            lmstudioApiKey: lmstudioApiKey.trim() || undefined,
            lmstudioModel: lmstudioModel.trim() || undefined,
          }),
    };
    saveLMConfig(config);
    setCurrentConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    clearLMConfig();
    setCurrentConfig(null);
    setClaudeApiKey('');
    setLmstudioEndpoint('http://localhost:1234');
    setLmstudioApiKey('');
    setLmstudioModel('');
    setSaved(false);
  }

  function maskKey(key: string | undefined): string {
    if (!key || key.length < 8) return '(未設定)';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  return (
    <>
      <Header />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>LM設定</h1>
          <p className={styles.description}>
            パターン分析に使用するAIプロバイダーを設定します。
            設定はブラウザのローカルストレージに保存され、サーバーには送信されません。
          </p>

          {currentConfig && (
            <div className={styles.currentStatus}>
              <span className={styles.statusLabel}>現在の設定:</span>
              <span className={styles.statusValue}>
                {currentConfig.provider === 'claude'
                  ? `Claude API (${maskKey(currentConfig.claudeApiKey)})`
                  : `LM Studio (${currentConfig.lmstudioEndpoint ?? 'http://localhost:1234'})`}
              </span>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="provider">
              AIプロバイダー
            </label>
            <select
              id="provider"
              className={styles.select}
              value={provider}
              onChange={(e) => setProvider(e.target.value as LMProvider)}
            >
              <option value="claude">Claude API (Anthropic)</option>
              <option value="lmstudio">LM Studio (ローカル)</option>
            </select>
          </div>

          {provider === 'claude' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="claudeApiKey">
                Claude APIキー
              </label>
              <input
                id="claudeApiKey"
                type="password"
                className={styles.input}
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
              />
            </div>
          )}

          {provider === 'lmstudio' && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="lmstudioEndpoint">
                  LM Studio エンドポイント
                </label>
                <input
                  id="lmstudioEndpoint"
                  type="text"
                  className={styles.input}
                  value={lmstudioEndpoint}
                  onChange={(e) => setLmstudioEndpoint(e.target.value)}
                  placeholder="http://localhost:1234"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="lmstudioApiKey">
                  APIキー（任意）
                </label>
                <input
                  id="lmstudioApiKey"
                  type="password"
                  className={styles.input}
                  value={lmstudioApiKey}
                  onChange={(e) => setLmstudioApiKey(e.target.value)}
                  placeholder="通常は不要"
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="lmstudioModel">
                  モデル名（任意）
                </label>
                <input
                  id="lmstudioModel"
                  type="text"
                  className={styles.input}
                  value={lmstudioModel}
                  onChange={(e) => setLmstudioModel(e.target.value)}
                  placeholder="local-model"
                />
              </div>
            </>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleSave}>
              保存
            </button>
            {currentConfig && (
              <button type="button" className={styles.secondary} onClick={handleClear}>
                クリア
              </button>
            )}
          </div>

          {saved && <p className={styles.savedMsg}>設定を保存しました</p>}
        </section>
      </main>
      <Footer />
    </>
  );
}
