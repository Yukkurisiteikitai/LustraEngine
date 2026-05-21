/**
 * @jest-environment node
 */

import { PATCH } from '@/app/api/logs/[experienceId]/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createManageExperienceDispositionUseCase } from '@/container/createUseCases';
import { refreshAnalyticsViewCache } from '@/container/loadAnalyticsViewModel';
import { getAnalyticsViewCacheKV } from '@/infrastructure/cache/AnalyticsViewCache';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
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

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateManageExperienceDispositionUseCase =
  createManageExperienceDispositionUseCase as jest.Mock;
const mockRefreshAnalyticsViewCache = refreshAnalyticsViewCache as jest.Mock;
const mockGetAnalyticsViewCacheKV = getAnalyticsViewCacheKV as jest.Mock;

describe('/api/logs/[experienceId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockGetAnalyticsViewCacheKV.mockResolvedValue({ get: jest.fn(), put: jest.fn() });
    mockRefreshAnalyticsViewCache.mockResolvedValue(undefined);
    mockCreateManageExperienceDispositionUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        action: 'soft_delete',
        updatedCount: 1,
        affectedHypothesisCount: 2,
      }),
    });
  });

  it('soft deletes evidence and marks linked hypotheses stale', async () => {
    const response = await PATCH(
      new Request('https://example.test/api/logs/e-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'soft_delete' }),
      }),
      { params: Promise.resolve({ experienceId: 'e-1' }) },
    );
    const json = (await response.json()) as { action: string; affectedHypothesisCount: number };

    expect(response.status).toBe(200);
    expect(json.action).toBe('soft_delete');
    expect(json.affectedHypothesisCount).toBe(2);
    expect(mockCreateManageExperienceDispositionUseCase).toHaveBeenCalled();
    expect(mockRefreshAnalyticsViewCache).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.anything(),
    );
  });
});
