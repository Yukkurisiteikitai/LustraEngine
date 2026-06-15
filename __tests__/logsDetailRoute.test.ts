/**
 * @jest-environment node
 */

import { GET } from '@/app/api/logs/[experienceId]/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createManageExperienceDispositionUseCase: jest.fn(),
}));

jest.mock('@/container/loadAnalyticsViewModel', () => ({
  refreshAnalyticsViewCache: jest.fn(),
}));

jest.mock('@/infrastructure/cache/AnalyticsViewCache', () => ({
  getAnalyticsViewCacheKV: jest.fn(),
}));

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;

describe('/api/logs/[experienceId] GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a single experience for the authenticated user', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      experience: {
        findById: jest.fn().mockResolvedValue({
          id: 'e-1',
          userId: 'user-1',
          description: '会議で緊張した',
          stressLevel: 4,
          actionResult: 'CONFRONTED_SUCCESS',
          source: 'manual',
          visibility: 'private',
          reportDifficulty: 3,
          careful: false,
          goal: '説明する',
          action: '話した',
          emotion: '不安',
          context: '午後の会議',
          actionMemo: '少し落ち着いた',
          domainKey: 'WORK',
          date: '2026-05-20',
          softDeletedAt: null,
        }),
      },
    });

    const response = await GET(new Request('https://example.test/api/logs/e-1'), {
      params: Promise.resolve({ experienceId: 'e-1' }),
    });
    const json = (await response.json()) as { experience: { id: string } };

    expect(response.status).toBe(200);
    expect(json.experience.id).toBe('e-1');
    expect(mockCreateRepositories).toHaveBeenCalled();
  });

  it('returns 404 when the record is missing', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      experience: {
        findById: jest.fn().mockResolvedValue(null),
      },
    });

    const response = await GET(new Request('https://example.test/api/logs/missing'), {
      params: Promise.resolve({ experienceId: 'missing' }),
    });

    expect(response.status).toBe(404);
  });
});
