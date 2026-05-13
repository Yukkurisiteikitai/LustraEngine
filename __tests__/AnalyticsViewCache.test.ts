import {
  getAnalyticsViewCacheKey,
  getOrBuildAnalyticsViewModel,
  readAnalyticsViewCache,
  writeAnalyticsViewCache,
  type AnalyticsViewCacheKV,
} from '@/infrastructure/cache/AnalyticsViewCache';
import type { DashboardViewModel } from '@/application/viewmodels/AnalyticsViewModel';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: jest.fn(),
}));

const dashboardViewModel: DashboardViewModel = {
  version: 1,
  generatedAt: '2026-05-13T00:00:00.000Z',
  latestLogCreatedAt: '2026-05-13',
  confrontRate: 100,
  averageStress: 0.7,
  streakDays: 2,
  stressTrend: [0, 0, 0, 0, 0, 1, 1],
  recentObstacles: [
    {
      id: 'exp-1',
      description: '数学2の問題集に挑む',
      domain: 'SELF',
      stressLevel: 1,
      createdAt: '2026-05-13',
      actionResult: 'CONFRONTED',
    },
  ],
};

function kvWithValue(value: string | null): AnalyticsViewCacheKV {
  return {
    get: jest.fn().mockResolvedValue(value),
    put: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AnalyticsViewCache', () => {
  it('builds target based analytics view cache keys', () => {
    expect(getAnalyticsViewCacheKey('user-1', 'dashboard')).toBe(
      'analytics:view:v1:user-1:dashboard',
    );
    expect(getAnalyticsViewCacheKey('user-1', 'home')).toBe('analytics:view:v1:user-1:home');
  });

  it('returns parsed cache value for valid JSON and version', async () => {
    const kv = kvWithValue(JSON.stringify(dashboardViewModel));

    await expect(readAnalyticsViewCache(kv, 'user-1', 'dashboard')).resolves.toEqual(
      dashboardViewModel,
    );
  });

  it('returns null for invalid JSON', async () => {
    const kv = kvWithValue('{invalid-json');

    await expect(readAnalyticsViewCache(kv, 'user-1', 'dashboard')).resolves.toBeNull();
  });

  it('returns null for version mismatch', async () => {
    const kv = kvWithValue(JSON.stringify({ ...dashboardViewModel, version: 2 }));

    await expect(readAnalyticsViewCache(kv, 'user-1', 'dashboard')).resolves.toBeNull();
  });

  it('writes JSON values to KV', async () => {
    const kv = kvWithValue(null);

    await writeAnalyticsViewCache(kv, 'user-1', 'dashboard', dashboardViewModel);

    expect(kv.put).toHaveBeenCalledWith(
      'analytics:view:v1:user-1:dashboard',
      JSON.stringify(dashboardViewModel),
    );
  });

  it('uses KV hit without calling build', async () => {
    const kv = kvWithValue(JSON.stringify(dashboardViewModel));
    const build = jest.fn();

    const result = await getOrBuildAnalyticsViewModel({
      kv,
      userId: 'user-1',
      target: 'dashboard',
      build,
    });

    expect(result).toEqual(dashboardViewModel);
    expect(build).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('builds and caches on miss', async () => {
    const kv = kvWithValue(null);
    const build = jest.fn().mockResolvedValue(dashboardViewModel);

    const result = await getOrBuildAnalyticsViewModel({
      kv,
      userId: 'user-1',
      target: 'dashboard',
      build,
    });

    expect(result).toEqual(dashboardViewModel);
    expect(build).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });

  it('returns fresh value when KV put fails', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const kv: AnalyticsViewCacheKV = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockRejectedValue(new Error('kv down')),
    };

    await expect(
      getOrBuildAnalyticsViewModel({
        kv,
        userId: 'user-1',
        target: 'dashboard',
        build: jest.fn().mockResolvedValue(dashboardViewModel),
      }),
    ).resolves.toEqual(dashboardViewModel);

    consoleWarn.mockRestore();
  });
});
