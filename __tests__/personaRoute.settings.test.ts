/**
 * @jest-environment node
 */

import { GET } from '@/app/api/persona/route';
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

describe('persona route settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a disabled snapshot when model snapshot generation is off', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      userSettings: {
        ensureDefaultByUser: jest.fn().mockResolvedValue({
          allowSnapshotGeneration: false,
          allowModelSnapshotGeneration: false,
          allowChatFallbackDraft: false,
          allowChatHistorySave: false,
          requireConfirmationBeforeReanalysis: true,
        }),
      },
      traitHypothesis: {
        findActiveByUser: jest.fn(),
      },
      psychology: {
        getBigFiveScore: jest.fn(),
        getAttachmentProfile: jest.fn(),
        getIdentityStatus: jest.fn(),
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      snapshotGenerationEnabled: boolean;
      snapshot: { summaryText: string };
    };
    expect(json.snapshotGenerationEnabled).toBe(false);
    expect(json.snapshot.summaryText).toContain('無効');
  });

  it('falls back to default settings when user settings cannot be loaded', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      userSettings: {
        ensureDefaultByUser: jest.fn().mockRejectedValue(new Error('user_settings missing')),
      },
      traitHypothesis: {
        findActiveByUser: jest.fn().mockResolvedValue([]),
      },
      psychology: {
        getBigFiveScore: jest.fn().mockResolvedValue(null),
        getAttachmentProfile: jest.fn().mockResolvedValue(null),
        getIdentityStatus: jest.fn().mockResolvedValue([]),
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      snapshotGenerationEnabled: boolean;
      allowChatFallbackDraft: boolean;
    };
    expect(json.snapshotGenerationEnabled).toBe(true);
    expect(json.allowChatFallbackDraft).toBe(true);
  });
});
