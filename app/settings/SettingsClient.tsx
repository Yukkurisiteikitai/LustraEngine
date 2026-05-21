'use client';

import { useEffect, useState } from 'react';
import { loadLMConfig, saveLMConfig, clearLMConfig } from '@/lib/lmConfig';
import type { LMConfig, LLMProviderType, LMProvider } from '@/types';
import styles from './page.module.css';

type SavedLlmSetting = {
  provider: string;
  type: string;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SettingsClientProps = {
  isProduction: boolean;
  llmSettingsEnabled: boolean;
};

function getInitialProvider(provider?: string): LMProvider {
  if (
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'gemini' ||
    provider === 'deepseek' ||
    provider === 'custom_openai_compatible' ||
    provider === 'lmstudio' ||
    provider === 'claude'
  ) {
    return provider;
  }
  return 'anthropic';
}

function buildStatusLabel(setting: SavedLlmSetting | null, provider: LMProvider, baseUrl: string): string {
  if (setting) {
    return `${setting.provider} / ${setting.model}${setting.hasApiKey ? ' / apiKey saved' : ''}`;
  }

  if (provider === 'custom_openai_compatible' || provider === 'lmstudio') {
    return `Custom/OpenAI compatible (${baseUrl})`;
  }

  return provider;
}

export default function SettingsClient({ isProduction, llmSettingsEnabled }: SettingsClientProps) {
  const [provider, setProvider] = useState<LMProvider>('anthropic');
  const [type, setType] = useState<LLMProviderType>('claude');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.anthropic.com/v1');
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [temperature, setTemperature] = useState('0.2');
  const [maxTokens, setMaxTokens] = useState('1024');
  const [lmstudioEndpoint, setLmstudioEndpoint] = useState('http://localhost:1234/v1');
  const [lmstudioApiKey, setLmstudioApiKey] = useState('lm-studio');
  const [lmstudioModel, setLmstudioModel] = useState('local-model');
  const [saved, setSaved] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<LMConfig | null>(null);
  const [serverSetting, setServerSetting] = useState<SavedLlmSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        if (!isProduction) {
          const cfg = loadLMConfig();
          if (cfg) {
            if (cancelled) return;
            setCurrentConfig(cfg);
            setProvider(cfg.provider);
            setType(cfg.type ?? (cfg.provider === 'anthropic' || cfg.provider === 'claude' ? 'claude' : 'gpt'));
            setApiKey(cfg.apiKey ?? cfg.claudeApiKey ?? cfg.lmstudioApiKey ?? '');
            setBaseUrl(
              cfg.baseUrl ??
                (cfg.provider === 'anthropic' || cfg.provider === 'claude'
                  ? 'https://api.anthropic.com/v1'
                  : 'https://api.openai.com/v1'),
            );
            setModel(
              cfg.model ??
                cfg.lmstudioModel ??
                (cfg.provider === 'anthropic' || cfg.provider === 'claude'
                  ? 'claude-haiku-4-5-20251001'
                  : 'gpt-4o-mini'),
            );
            setTemperature(String(cfg.temperature ?? 0.2));
            setMaxTokens(String(cfg.maxTokens ?? 1024));
            setLmstudioEndpoint(cfg.lmstudioEndpoint ?? 'http://localhost:1234/v1');
            setLmstudioApiKey(cfg.lmstudioApiKey ?? 'lm-studio');
            setLmstudioModel(cfg.lmstudioModel ?? 'local-model');
          }
        }

        const response = await fetch('/api/settings/llm', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('サーバー設定の取得に失敗しました');
        }
        const payload = (await response.json()) as { setting: SavedLlmSetting | null };
        if (cancelled) return;

        setServerSetting(payload.setting);
        if (payload.setting) {
          setProvider(getInitialProvider(payload.setting.provider));
          setType(payload.setting.type as LLMProviderType);
          setApiKey('');
          setHasApiKey(payload.setting.hasApiKey);
          setBaseUrl(payload.setting.baseUrl ?? 'https://api.anthropic.com/v1');
          setModel(payload.setting.model);
          setCurrentConfig({
            provider: getInitialProvider(payload.setting.provider),
            type: payload.setting.type as LLMProviderType,
            baseUrl: payload.setting.baseUrl ?? undefined,
            model: payload.setting.model,
          });
        }
      } catch {
        if (!cancelled) {
          setError('設定の読み込みに失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [isProduction]);

  async function handleSave() {
    setSaving(true);
    setError('');
    const config: LMConfig = {
      provider,
      type,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      model: model.trim() || undefined,
      temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : undefined,
      maxTokens: Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : undefined,
      claudeApiKey: apiKey.trim() || undefined,
      lmstudioEndpoint: lmstudioEndpoint.trim() || undefined,
      lmstudioApiKey: lmstudioApiKey.trim() || undefined,
      lmstudioModel: lmstudioModel.trim() || undefined,
    };

    try {
      const response = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const payload = (await response.json()) as { setting?: SavedLlmSetting; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? '設定の保存に失敗しました');
      }

      if (!isProduction) {
        saveLMConfig(config);
      } else {
        clearLMConfig();
      }

      setServerSetting(payload.setting ?? null);
      setCurrentConfig({ ...config, apiKey: undefined });
      setHasApiKey(Boolean(payload.setting?.hasApiKey));
      setApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    if (!isProduction) {
      clearLMConfig();
    }
    setCurrentConfig(null);
    setProvider('anthropic');
    setType('claude');
    setApiKey('');
    setBaseUrl('https://api.anthropic.com/v1');
    setModel('claude-haiku-4-5-20251001');
    setTemperature('0.2');
    setMaxTokens('1024');
    setLmstudioEndpoint('http://localhost:1234/v1');
    setLmstudioApiKey('lm-studio');
    setLmstudioModel('local-model');
    setSaved(false);
    setHasApiKey(false);
  }

  const isSettingsLocked = !llmSettingsEnabled;

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>LM設定</h1>
      <p className={styles.description}>
        パターン分析に使用するAIプロバイダーを設定します。
        APIキーはサーバー側に暗号化して保存されます。
      </p>

      {isSettingsLocked && (
        <div className={styles.notice} style={{ backgroundColor: '#e8f4f8', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
          <strong>本番環境について</strong>
          <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
            本番/previewでは、ユーザー個別のLLM API key保存は現在無効です。
            <br />
            分析には管理者が設定したサーバー側LLMを使用します。
          </p>
        </div>
      )}

      {loading && <p className={styles.notice}>設定を読み込み中です...</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {llmSettingsEnabled && (currentConfig || serverSetting) && (
        <div className={styles.currentStatus}>
          <span className={styles.statusLabel}>現在の設定:</span>
          <span className={styles.statusValue}>
            {buildStatusLabel(serverSetting, provider, baseUrl)}
          </span>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (llmSettingsEnabled) {
            void handleSave();
          }
        }}
      >
        <fieldset className={styles.fieldset} disabled={!llmSettingsEnabled}>
          {!llmSettingsEnabled && (
            <legend className={styles.srOnly}>LLM設定は無効です</legend>
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
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="gemini" disabled>
                  Gemini (未対応)
                </option>
                <option value="custom_openai_compatible">Custom OpenAI-compatible</option>
                <option value="lmstudio">LM Studio (legacy local)</option>
              </select>
            </div>

            {(provider === 'anthropic' ||
              provider === 'openai' ||
              provider === 'deepseek' ||
              provider === 'gemini' ||
              provider === 'custom_openai_compatible') && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="apiKey">
                  APIキー
                </label>
                <input
                  id="apiKey"
                  type="password"
                  className={styles.input}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="任意の API キー"
                  autoComplete="off"
                />
              </div>
            )}

            {(provider === 'anthropic' ||
              provider === 'openai' ||
              provider === 'deepseek' ||
              provider === 'gemini' ||
              provider === 'custom_openai_compatible') && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="type">
                  Type
                </label>
                <select
                  id="type"
                  className={styles.select}
                  value={type}
                  onChange={(e) => setType(e.target.value as LLMProviderType)}
                >
                  <option value="gpt">GPT-compatible</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
            )}

            {(provider === 'anthropic' ||
              provider === 'openai' ||
              provider === 'deepseek' ||
              provider === 'gemini' ||
              provider === 'custom_openai_compatible') && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="baseUrl">
                  Base URL
                </label>
                <input
                  id="baseUrl"
                  type="text"
                  className={styles.input}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                {provider === 'custom_openai_compatible' && (
                  <p className={styles.notice}>
                    本番では localhost / private IP / http の URL は使用できません。OpenAI compatible な HTTPS エンドポイントを指定してください。
                  </p>
                )}
              </div>
            )}

            {(provider === 'anthropic' ||
              provider === 'openai' ||
              provider === 'deepseek' ||
              provider === 'gemini' ||
              provider === 'custom_openai_compatible') && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="model">
                  モデル名
                </label>
                <input
                  id="model"
                  type="text"
                  className={styles.input}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </div>
            )}

            {(provider === 'anthropic' ||
              provider === 'openai' ||
              provider === 'deepseek' ||
              provider === 'gemini' ||
              provider === 'custom_openai_compatible') && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="temperature">
                  Temperature
                </label>
                <input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  className={styles.input}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </div>
            )}

            {(provider === 'anthropic' ||
              provider === 'openai' ||
              provider === 'deepseek' ||
              provider === 'gemini' ||
              provider === 'custom_openai_compatible') && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="maxTokens">
                  Max Tokens
                </label>
                <input
                  id="maxTokens"
                  type="number"
                  min="1"
                  className={styles.input}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
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
                    placeholder="http://localhost:1234/v1"
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
                    placeholder="lm-studio"
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
              <button type="submit" className={styles.primary} disabled={saving || loading}>
                保存
              </button>
              {currentConfig && (
                <button type="button" className={styles.secondary} onClick={handleClear} disabled={saving}>
                  クリア
                </button>
              )}
            </div>

            {saved && <p className={styles.savedMsg}>設定を保存しました</p>}
        </fieldset>
      </form>
    </section>
  );
}
