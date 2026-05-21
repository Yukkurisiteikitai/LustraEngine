import type { SupabaseClient } from '@supabase/supabase-js';
import { createBuildAnalyticsViewModelUseCase } from '@/container/createUseCases';
import { toHomeSummaryViewModel } from '@/application/usecases/BuildAnalyticsViewModelUseCase';
import type {
  DashboardViewModel,
  HomeSummaryViewModel,
} from '@/application/viewmodels/AnalyticsViewModel';
import {
  getAnalyticsViewCacheKV,
  getOrBuildAnalyticsViewModel,
  writeAnalyticsViewCache,
  type AnalyticsViewCacheKV,
} from '@/infrastructure/cache/AnalyticsViewCache';

export async function loadDashboardViewModel(
  supabase: SupabaseClient,
  userId: string,
  kv?: AnalyticsViewCacheKV | null,
): Promise<DashboardViewModel> {
  const viewCache = kv === undefined ? await getAnalyticsViewCacheKV() : kv;

  return getOrBuildAnalyticsViewModel({
    kv: viewCache,
    userId,
    target: 'dashboard',
    build: () => createBuildAnalyticsViewModelUseCase(supabase).buildDashboard(userId),
  });
}

export async function loadHomeSummaryViewModel(
  supabase: SupabaseClient,
  userId: string,
  kv?: AnalyticsViewCacheKV | null,
): Promise<HomeSummaryViewModel> {
  const viewCache = kv === undefined ? await getAnalyticsViewCacheKV() : kv;

  return getOrBuildAnalyticsViewModel({
    kv: viewCache,
    userId,
    target: 'home',
    build: () => createBuildAnalyticsViewModelUseCase(supabase).buildHome(userId),
  });
}

export async function refreshAnalyticsViewCache(
  supabase: SupabaseClient,
  userId: string,
  kv: AnalyticsViewCacheKV | null,
): Promise<void> {
  if (!kv) {
    return;
  }

  const builder = createBuildAnalyticsViewModelUseCase(supabase);
  const dashboard = await builder.buildDashboard(userId);
  const home = toHomeSummaryViewModel(dashboard);

  await Promise.all([
    writeAnalyticsViewCache(kv, userId, 'dashboard', dashboard),
    writeAnalyticsViewCache(kv, userId, 'home', home),
  ]);
}
