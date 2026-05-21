import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserSettingsRepository } from '@/core/domains/user-settings/IUserSettingsRepository';
import type { UserSettingsData, UserSettingsUpdateInput } from '@/core/domains/user-settings/UserSettings';
import { DEFAULT_USER_SETTINGS } from '@/core/domains/user-settings/UserSettings';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

function mapRow(row: Record<string, unknown>): UserSettingsData {
  const allowSnapshotGeneration =
    typeof row.allow_snapshot_generation === 'boolean'
      ? row.allow_snapshot_generation
      : typeof row.allow_model_snapshot_generation === 'boolean'
        ? row.allow_model_snapshot_generation
        : true;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    analysisEnabled: Boolean(row.analysis_enabled),
    includeSensitiveEvidence: Boolean(row.include_sensitive_evidence),
    defaultEvidenceVisibility:
      (row.default_evidence_visibility as UserSettingsData['defaultEvidenceVisibility']) ??
      'private',
    allowChatFallbackDraft: Boolean(row.allow_chat_fallback_draft),
    allowSnapshotGeneration,
    allowChatHistorySave: Boolean(row.allow_chat_history_save),
    requireConfirmationBeforeReanalysis: Boolean(
      row.require_confirmation_before_reanalysis,
    ),
    allowModelSnapshotGeneration: allowSnapshotGeneration,
    dataExportEnabled: Boolean(row.data_export_enabled),
    dataDeletionRequestedAt: (row.data_deletion_requested_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseUserSettingsRepository implements IUserSettingsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getByUser(userId: string): Promise<UserSettingsData | null> {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new InfrastructureError('userSettings:getByUser failed', error);
    return data ? mapRow(data as Record<string, unknown>) : null;
  }

  async ensureDefaultByUser(userId: string): Promise<UserSettingsData> {
    const existing = await this.getByUser(userId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('user_settings')
      .insert({
        user_id: userId,
        analysis_enabled: DEFAULT_USER_SETTINGS.analysisEnabled,
        include_sensitive_evidence: DEFAULT_USER_SETTINGS.includeSensitiveEvidence,
        default_evidence_visibility: DEFAULT_USER_SETTINGS.defaultEvidenceVisibility,
        allow_chat_fallback_draft: DEFAULT_USER_SETTINGS.allowChatFallbackDraft,
        allow_snapshot_generation: DEFAULT_USER_SETTINGS.allowSnapshotGeneration,
        allow_model_snapshot_generation: DEFAULT_USER_SETTINGS.allowSnapshotGeneration,
        allow_chat_history_save: DEFAULT_USER_SETTINGS.allowChatHistorySave,
        require_confirmation_before_reanalysis:
          DEFAULT_USER_SETTINGS.requireConfirmationBeforeReanalysis,
        data_export_enabled: DEFAULT_USER_SETTINGS.dataExportEnabled,
        data_deletion_requested_at: DEFAULT_USER_SETTINGS.dataDeletionRequestedAt,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      const refetched = await this.getByUser(userId);
      if (refetched) return refetched;
      throw new InfrastructureError('userSettings:ensureDefaultByUser failed', error);
    }

    return mapRow(data as Record<string, unknown>);
  }

  async updateByUser(userId: string, input: UserSettingsUpdateInput): Promise<UserSettingsData> {
    const existing = await this.ensureDefaultByUser(userId);
    const now = new Date().toISOString();
    const allowSnapshotGeneration =
      input.allowSnapshotGeneration ?? input.allowModelSnapshotGeneration ?? existing.allowSnapshotGeneration;
    const { data, error } = await this.supabase
      .from('user_settings')
      .update({
        analysis_enabled: input.analysisEnabled ?? existing.analysisEnabled,
        include_sensitive_evidence:
          input.includeSensitiveEvidence ?? existing.includeSensitiveEvidence,
        default_evidence_visibility:
          input.defaultEvidenceVisibility ?? existing.defaultEvidenceVisibility,
        allow_chat_fallback_draft: input.allowChatFallbackDraft ?? existing.allowChatFallbackDraft,
        allow_snapshot_generation: allowSnapshotGeneration,
        allow_model_snapshot_generation: allowSnapshotGeneration,
        allow_chat_history_save:
          input.allowChatHistorySave ?? existing.allowChatHistorySave,
        require_confirmation_before_reanalysis:
          input.requireConfirmationBeforeReanalysis ??
          existing.requireConfirmationBeforeReanalysis,
        data_export_enabled: input.dataExportEnabled ?? existing.dataExportEnabled,
        data_deletion_requested_at:
          input.dataDeletionRequestedAt === undefined
            ? existing.dataDeletionRequestedAt
            : input.dataDeletionRequestedAt,
        updated_at: now,
      })
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new InfrastructureError('userSettings:updateByUser failed', error);
    const updated = mapRow(data as Record<string, unknown>);

    const { error: auditError } = await this.supabase
      .from('user_settings_audit_logs')
      .insert({
        user_id: userId,
        setting_key: 'user_settings',
        old_value: existing,
        new_value: updated,
        changed_at: now,
      });

    if (auditError) {
      console.error('userSettings:audit_log_failed', {
        userId,
        error: auditError.message,
      });
    }

    return updated;
  }
}
