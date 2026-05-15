/**
 * @jest-environment node
 */

import { GET, PUT } from '@/app/api/settings/user/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;

describe('user settings route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default user settings on GET', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const ensureDefaultByUser = jest.fn().mockResolvedValue({
      id: 'settings-1',
      userId: 'user-1',
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
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
    });
    mockCreateRepositories.mockReturnValue({
      userSettings: { ensureDefaultByUser, updateByUser: jest.fn() },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(ensureDefaultByUser).toHaveBeenCalledWith('user-1');
    const json = (await response.json()) as {
      settings: { userId: string; defaultEvidenceVisibility: string };
    };
    expect(json.settings.userId).toBe('user-1');
    expect(json.settings.defaultEvidenceVisibility).toBe('private');
  });

  it('updates user settings on PUT', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const updateByUser = jest.fn().mockResolvedValue({
      id: 'settings-1',
      userId: 'user-1',
      analysisEnabled: false,
      includeSensitiveEvidence: true,
      defaultEvidenceVisibility: 'private',
      allowChatFallbackDraft: false,
      allowSnapshotGeneration: false,
      allowChatHistorySave: true,
      requireConfirmationBeforeReanalysis: false,
      allowModelSnapshotGeneration: false,
      dataExportEnabled: false,
      dataDeletionRequestedAt: '2026-05-15T00:00:00.000Z',
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    mockCreateRepositories.mockReturnValue({
      userSettings: {
        ensureDefaultByUser: jest.fn(),
        updateByUser,
      },
    });

    const response = await PUT(
      new Request('http://localhost/api/settings/user', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analysisEnabled: false,
          includeSensitiveEvidence: true,
          defaultEvidenceVisibility: 'private',
          allowChatFallbackDraft: false,
          allowSnapshotGeneration: false,
          allowChatHistorySave: true,
          requireConfirmationBeforeReanalysis: false,
          allowModelSnapshotGeneration: false,
          dataExportEnabled: false,
          dataDeletionRequestedAt: '2026-05-15T00:00:00.000Z',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateByUser).toHaveBeenCalledWith('user-1', {
      analysisEnabled: false,
      includeSensitiveEvidence: true,
      defaultEvidenceVisibility: 'private',
      allowChatFallbackDraft: false,
      allowSnapshotGeneration: false,
      allowChatHistorySave: true,
      requireConfirmationBeforeReanalysis: false,
      allowModelSnapshotGeneration: false,
      dataExportEnabled: false,
      dataDeletionRequestedAt: '2026-05-15T00:00:00.000Z',
    });
  });
});
