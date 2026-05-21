import { render, screen, waitFor } from '@testing-library/react';
import UserSettingsSection from '@/app/settings/UserSettingsSection';

describe('UserSettingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/settings/user')) {
        return {
          ok: true,
          json: async () => ({
            settings: {
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
              createdAt: '2026-05-15T00:00:00.000Z',
              updatedAt: '2026-05-15T00:00:00.000Z',
            },
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof fetch;
  });

  it('shows export and deletion entry points', async () => {
    render(<UserSettingsSection />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'ユーザー管理設定' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'データを書き出す' })).toHaveAttribute(
      'href',
      '/api/export',
    );
    expect(screen.getByRole('link', { name: '記録を削除する' })).toHaveAttribute(
      'href',
      '/logs',
    );
  });
});
