import type { EvidenceVisibility, UserSettingsRecord } from '@/types';

export type { EvidenceVisibility } from '@/types';

export interface UserSettingsData extends UserSettingsRecord {}

export interface UserSettingsUpdateInput {
  analysisEnabled?: boolean;
  includeSensitiveEvidence?: boolean;
  defaultEvidenceVisibility?: EvidenceVisibility;
  allowChatFallbackDraft?: boolean;
  allowSnapshotGeneration?: boolean;
  allowChatHistorySave?: boolean;
  requireConfirmationBeforeReanalysis?: boolean;
  allowModelSnapshotGeneration?: boolean;
  dataExportEnabled?: boolean;
  dataDeletionRequestedAt?: string | null;
}

export const DEFAULT_USER_SETTINGS: Omit<UserSettingsData, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
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
};

export function buildFallbackUserSettings(userId: string, now = new Date().toISOString()): UserSettingsData {
  return {
    id: `fallback-${userId}`,
    userId,
    ...DEFAULT_USER_SETTINGS,
    createdAt: now,
    updatedAt: now,
  };
}
