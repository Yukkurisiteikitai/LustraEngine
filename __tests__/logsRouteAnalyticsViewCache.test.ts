/**
 * @jest-environment node
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createBuildAnalyticsViewModelUseCase,
  createLogExperienceUseCase,
} from '@/container/createUseCases';
import { POST } from '@/app/api/logs/route';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createLogExperienceUseCase: jest.fn(),
  createBuildAnalyticsViewModelUseCase: jest.fn(),
}));

const mockGetCloudflareContext = getCloudflareContext as jest.Mock;
const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateLogExperienceUseCase = createLogExperienceUseCase as jest.Mock;
const mockCreateBuildAnalyticsViewModelUseCase =
  createBuildAnalyticsViewModelUseCase as jest.Mock;

const payload = {
  date: '2026-05-13',
  obstacles: [
    {
      description: '数学2の問題集に挑む',
      domain: 'SELF',
      stressLevel: 1,
      actionResult: 'CONFRONTED_SUCCESS',
    },
  ],
};

const dashboardViewModel = {
  version: 1,
  generatedAt: '2026-05-13T00:00:00.000Z',
  latestLogCreatedAt: '2026-05-13',
  confrontRate: 100,
  averageStress: 0.7,
  streakDays: 2,
  stressTrend: [0, 0, 0, 0, 0, 1, 1],
  recentObstacles: [],
};

function request() {
  return new Request('https://example.test/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('/api/logs Analytics View cache refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-1',
              user_metadata: { display_name: 'Yuuto' },
            },
          },
        }),
      },
    });
    mockCreateLogExperienceUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ savedIds: ['exp-1'] }),
    });
    mockCreateBuildAnalyticsViewModelUseCase.mockReturnValue({
      buildDashboard: jest.fn().mockResolvedValue(dashboardViewModel),
    });
  });

  it('puts dashboard and home ViewModel JSON after a successful log', async () => {
    const waitUntilPromises: Promise<unknown>[] = [];
    const kv = {
      get: jest.fn(),
      put: jest.fn().mockResolvedValue(undefined),
    };
    mockGetCloudflareContext.mockResolvedValue({
      env: { HTML_CACHE: kv },
      ctx: {
        waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
      },
    });

    const response = await POST(request());
    await Promise.all(waitUntilPromises);
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toMatchObject({
      ok: true,
      status: 'log_saved',
      message: '記録しました。',
    });
    expect(kv.put).toHaveBeenCalledTimes(2);
    expect(kv.put).toHaveBeenCalledWith(
      'analytics:view:v1:user-1:dashboard',
      JSON.stringify(dashboardViewModel),
    );
    expect(kv.put).toHaveBeenCalledWith(
      'analytics:view:v1:user-1:home',
      JSON.stringify({
        version: 1,
        generatedAt: dashboardViewModel.generatedAt,
        latestLogCreatedAt: dashboardViewModel.latestLogCreatedAt,
        confrontRate: dashboardViewModel.confrontRate,
        averageStress: dashboardViewModel.averageStress,
        streakDays: dashboardViewModel.streakDays,
      }),
    );
  });

  it('keeps the API successful when ViewModel cache put fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const waitUntilPromises: Promise<unknown>[] = [];
    const kv = {
      get: jest.fn(),
      put: jest.fn().mockRejectedValue(new Error('kv put failed')),
    };
    mockGetCloudflareContext.mockResolvedValue({
      env: { HTML_CACHE: kv },
      ctx: {
        waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
      },
    });

    const response = await POST(request());
    await Promise.all(waitUntilPromises);
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toMatchObject({
      ok: true,
      status: 'log_saved',
    });

    consoleError.mockRestore();
  });
});
