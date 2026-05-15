'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';
import type {
  UserSettingsData,
  UserSettingsUpdateInput,
} from '@/core/domains/user-settings/UserSettings';

const DEFAULT_SETTINGS: UserSettingsData = {
  id: '',
  userId: '',
  analysisEnabled: true,
  includeSensitiveEvidence: false,
  defaultEvidenceVisibility: 'private',
  allowChatFallbackDraft: true,
  allowSnapshotGeneration: true,
  allowChatHistorySave: false,
  requireConfirmationBeforeReanalysis: true,
  allowModelSnapshotGeneration: true,
  dataExportEnabled: true,
  dataDeletionRequestedAt: null,
  createdAt: '',
  updatedAt: '',
};

function formatDate(value: string | null) {
  if (!value) return '未設定';
  return new Date(value).toLocaleString('ja-JP');
}

export default function UserSettingsSection() {
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reanalysisLoading, setReanalysisLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [reanalysisMessage, setReanalysisMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/settings/user', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('ユーザー設定の読み込みに失敗しました');
        }
        const json = (await res.json()) as { settings: UserSettingsData };
        if (!cancelled) {
          setSettings(json.settings ?? DEFAULT_SETTINGS);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'ユーザー設定の読み込みに失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  function update(partial: Partial<UserSettingsData>) {
    setSettings((prev) => (prev ? { ...prev, ...partial } : { ...DEFAULT_SETTINGS, ...partial }));
  }

  async function save(next: UserSettingsUpdateInput) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = (await res.json()) as { settings?: UserSettingsData; message?: string };
      if (!res.ok) {
        throw new Error(json.message ?? 'ユーザー設定の保存に失敗しました');
      }
      setSettings(json.settings ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'ユーザー設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!settings) return;
    await save({
      analysisEnabled: settings.analysisEnabled,
      includeSensitiveEvidence: settings.includeSensitiveEvidence,
      defaultEvidenceVisibility: settings.defaultEvidenceVisibility,
      allowChatFallbackDraft: settings.allowChatFallbackDraft,
      allowSnapshotGeneration: settings.allowSnapshotGeneration,
      allowChatHistorySave: settings.allowChatHistorySave,
      requireConfirmationBeforeReanalysis: settings.requireConfirmationBeforeReanalysis,
      allowModelSnapshotGeneration: settings.allowSnapshotGeneration,
      dataExportEnabled: settings.dataExportEnabled,
      dataDeletionRequestedAt: settings.dataDeletionRequestedAt,
    });
  }

  async function requestDeletion() {
    const now = new Date().toISOString();
    await save({
      analysisEnabled: settings?.analysisEnabled,
      includeSensitiveEvidence: settings?.includeSensitiveEvidence,
      defaultEvidenceVisibility: settings?.defaultEvidenceVisibility,
      allowChatFallbackDraft: settings?.allowChatFallbackDraft,
      allowSnapshotGeneration: settings?.allowSnapshotGeneration,
      allowChatHistorySave: settings?.allowChatHistorySave,
      requireConfirmationBeforeReanalysis: settings?.requireConfirmationBeforeReanalysis,
      allowModelSnapshotGeneration: settings?.allowSnapshotGeneration,
      dataExportEnabled: settings?.dataExportEnabled,
      dataDeletionRequestedAt: now,
    });
  }

  async function requestReanalysis() {
    if (settings?.requireConfirmationBeforeReanalysis) {
      const confirmed = window.confirm('再分析をリクエストしますか？');
      if (!confirmed) return;
    }
    setReanalysisLoading(true);
    setReanalysisMessage('');
    try {
      const res = await fetch('/api/analysis/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'full_3months' }),
      });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(json.message ?? '再分析の開始に失敗しました');
      }
      setReanalysisMessage(json.message ?? '再分析を開始しました');
    } catch (reanalysisError) {
      setReanalysisMessage(
        reanalysisError instanceof Error ? reanalysisError.message : '再分析の開始に失敗しました',
      );
    } finally {
      setReanalysisLoading(false);
    }
  }

  if (loading) {
    return <p className={styles.notice}>ユーザー設定を読み込み中です...</p>;
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>ユーザー管理設定</h2>
      <p className={styles.description}>
        Evidence の分析範囲、モデル要約の表示、下書き、削除・エクスポートの方針を管理します。
      </p>

      {error ? <p className={styles.errorMsg}>{error}</p> : null}
      {saved ? <p className={styles.savedMsg}>設定を保存しました</p> : null}
      {reanalysisMessage ? <p className={styles.notice}>{reanalysisMessage}</p> : null}

      <div className={styles.checkboxGrid}>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.analysisEnabled ?? true}
            onChange={(event) => update({ analysisEnabled: event.target.checked })}
          />
          <span>
            <strong>分析を有効にする</strong>
            <small>無効にすると、Evidence からの分析ジョブを作成しません。</small>
          </span>
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.includeSensitiveEvidence ?? false}
            onChange={(event) => update({ includeSensitiveEvidence: event.target.checked })}
          />
          <span>
            <strong>機微な記録を含める</strong>
            <small>将来の機微ログ分類と表示方針に使います。</small>
          </span>
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.allowChatFallbackDraft ?? true}
            onChange={(event) => update({ allowChatFallbackDraft: event.target.checked })}
          />
          <span>
            <strong>Chat の下書きを有効にする</strong>
            <small>仮説が空のとき、/log/new に下書きを渡します。</small>
          </span>
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.allowSnapshotGeneration ?? true}
            onChange={(event) => update({
              allowSnapshotGeneration: event.target.checked,
              allowModelSnapshotGeneration: event.target.checked,
            })}
          />
          <span>
            <strong>モデル要約を生成する</strong>
            <small>無効にすると /persona の要約生成を止めます。</small>
          </span>
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.allowChatHistorySave ?? false}
            onChange={(event) => update({ allowChatHistorySave: event.target.checked })}
          />
          <span>
            <strong>Chat 履歴を保存する</strong>
            <small>無効にすると /api/chat の会話保存を止めます。</small>
          </span>
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.requireConfirmationBeforeReanalysis ?? true}
            onChange={(event) => update({ requireConfirmationBeforeReanalysis: event.target.checked })}
          />
          <span>
            <strong>再分析の確認を求める</strong>
            <small>権限拡大時の再分析は自動ではなく手動で進めます。</small>
          </span>
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={settings?.dataExportEnabled ?? true}
            onChange={(event) => update({ dataExportEnabled: event.target.checked })}
          />
          <span>
            <strong>データエクスポートを許可する</strong>
            <small>将来のエクスポート機能の利用可否を保存します。</small>
          </span>
        </label>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="defaultEvidenceVisibility">
          Evidence の既定公開範囲
        </label>
        <select
          id="defaultEvidenceVisibility"
          className={styles.select}
          value={settings?.defaultEvidenceVisibility ?? 'private'}
          onChange={(event) =>
            update({ defaultEvidenceVisibility: event.target.value as UserSettingsData['defaultEvidenceVisibility'] })
          }
        >
          <option value="private">private</option>
          <option value="analysis_allowed">analysis_allowed</option>
          <option value="excluded">excluded</option>
        </select>
        <p className={styles.notice}>
          analysis_allowed のみが分析対象です。private は自分用、excluded は分析・表示から外します。
        </p>
      </div>

      <div className={styles.field}>
        <p className={styles.label}>削除リクエスト</p>
        <p className={styles.notice}>
          削除要求時刻: {formatDate(settings?.dataDeletionRequestedAt ?? null)}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={requestDeletion}
            disabled={saving}
          >
            削除をリクエスト
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={handleSubmit}
          disabled={saving || !settings}
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void requestReanalysis()}
          disabled={saving || reanalysisLoading || !settings}
        >
          {reanalysisLoading ? '再分析中...' : '再分析をリクエスト'}
        </button>
      </div>
    </section>
  );
}
