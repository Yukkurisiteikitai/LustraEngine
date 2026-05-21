import {
  loadDashboardViewModel,
  loadHomeSummaryViewModel,
} from '@/container/loadAnalyticsViewModel';
import { createBuildAnalyticsViewModelUseCase } from '@/container/createUseCases';
import type {
  DashboardViewModel,
  HomeSummaryViewModel,
} from '@/application/viewmodels/AnalyticsViewModel';
import type { AnalyticsViewCacheKV } from '@/infrastructure/cache/AnalyticsViewCache';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createBuildAnalyticsViewModelUseCase: jest.fn(),
}));

const mockCreateBuildAnalyticsViewModelUseCase =
  createBuildAnalyticsViewModelUseCase as jest.Mock;

const dashboardViewModel: DashboardViewModel = {
  version: 1,
  generatedAt: '2026-05-13T00:00:00.000Z',
  latestLogCreatedAt: '2026-05-13',
  confrontRate: 100,
  averageStress: 0.7,
  streakDays: 2,
  stressTrend: [0, 0, 0, 0, 0, 1, 1],
  recentObstacles: [],
};

const homeViewModel: HomeSummaryViewModel = {
  version: 1,
  generatedAt: '2026-05-13T00:00:00.000Z',
  latestLogCreatedAt: '2026-05-13',
  confrontRate: 100,
  averageStress: 0.7,
  streakDays: 2,
};

describe('loadAnalyticsViewModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads Dashboard ViewModel from KV without rebuilding from DB', async () => {
    const kv: AnalyticsViewCacheKV = {
      get: jest.fn().mockResolvedValue(JSON.stringify(dashboardViewModel)),
      put: jest.fn(),
    };

    await expect(loadDashboardViewModel({} as never, 'user-1', kv)).resolves.toEqual(
      dashboardViewModel,
    );

    expect(mockCreateBuildAnalyticsViewModelUseCase).not.toHaveBeenCalled();
  });

  it('builds Home ViewModel from DB and writes KV on miss', async () => {
    const buildHome = jest.fn().mockResolvedValue(homeViewModel);
    mockCreateBuildAnalyticsViewModelUseCase.mockReturnValue({ buildHome });
    const kv: AnalyticsViewCacheKV = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
    };

    await expect(loadHomeSummaryViewModel({} as never, 'user-1', kv)).resolves.toEqual(
      homeViewModel,
    );

    expect(buildHome).toHaveBeenCalledWith('user-1');
    expect(kv.put).toHaveBeenCalledWith(
      'analytics:view:v1:user-1:home',
      JSON.stringify(homeViewModel),
    );
  });

  it('returns Dashboard ViewModel even when cache put fails', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const buildDashboard = jest.fn().mockResolvedValue(dashboardViewModel);
    mockCreateBuildAnalyticsViewModelUseCase.mockReturnValue({ buildDashboard });
    const kv: AnalyticsViewCacheKV = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockRejectedValue(new Error('kv put failed')),
    };

    await expect(loadDashboardViewModel({} as never, 'user-1', kv)).resolves.toEqual(
      dashboardViewModel,
    );

    consoleWarn.mockRestore();
  });
});
