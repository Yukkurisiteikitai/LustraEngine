import { SupabaseUserSettingsRepository } from '@/infrastructure/repositories/SupabaseUserSettingsRepository';

function makeUserSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings-1',
    user_id: 'user-1',
    analysis_enabled: true,
    include_sensitive_evidence: false,
    default_evidence_visibility: 'private',
    allow_chat_fallback_draft: true,
    allow_snapshot_generation: true,
    allow_model_snapshot_generation: true,
    allow_chat_history_save: false,
    require_confirmation_before_reanalysis: true,
    data_export_enabled: true,
    data_deletion_requested_at: null,
    created_at: '2026-05-14T00:00:00.000Z',
    updated_at: '2026-05-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('SupabaseUserSettingsRepository', () => {
  it('writes audit logs when settings are updated', async () => {
    const existingRow = makeUserSettingsRow();
    const updatedRow = makeUserSettingsRow({
      analysis_enabled: false,
      allow_snapshot_generation: false,
      allow_model_snapshot_generation: false,
      updated_at: '2026-05-15T00:00:00.000Z',
    });

    const userSettingsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: existingRow, error: null }),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updatedRow, error: null }),
    };
    const auditInsert = jest.fn().mockResolvedValue({ data: null, error: null });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_settings') return userSettingsQuery;
        if (table === 'user_settings_audit_logs') {
          return { insert: auditInsert };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const repo = new SupabaseUserSettingsRepository(supabase as never);
    const settings = await repo.updateByUser('user-1', {
      analysisEnabled: false,
      allowSnapshotGeneration: false,
      allowChatHistorySave: true,
    });

    expect(settings.analysisEnabled).toBe(false);
    expect(settings.allowSnapshotGeneration).toBe(false);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        setting_key: 'user_settings',
        old_value: expect.objectContaining({ analysisEnabled: true }),
        new_value: expect.objectContaining({ analysisEnabled: false }),
      }),
    );
  });
});
