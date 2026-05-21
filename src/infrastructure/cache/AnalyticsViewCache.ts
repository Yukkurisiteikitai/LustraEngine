import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  ANALYTICS_VIEW_MODEL_VERSION,
  type AnalyticsViewModel,
  type DashboardViewModel,
  type HomeSummaryViewModel,
} from '@/application/viewmodels/AnalyticsViewModel';

export type AnalyticsViewCacheTarget = 'dashboard' | 'home';

export type AnalyticsViewModelForTarget<T extends AnalyticsViewCacheTarget> =
  T extends 'dashboard' ? DashboardViewModel : HomeSummaryViewModel;

export type AnalyticsViewCacheKV = {
  get: (key: string) => string | null | Promise<string | null>;
  put: (key: string, value: string) => void | Promise<void>;
};

type CloudflareContextLike = {
  env: {
    HTML_CACHE?: unknown;
  };
};

function isAnalyticsViewCacheKV(value: unknown): value is AnalyticsViewCacheKV {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AnalyticsViewCacheKV).get === 'function' &&
    typeof (value as AnalyticsViewCacheKV).put === 'function'
  );
}

function isCloudflareContextLike(value: unknown): value is CloudflareContextLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const maybe = value as { env?: { HTML_CACHE?: unknown } };
  return typeof maybe.env === 'object' && maybe.env !== null;
}

function isVersionedAnalyticsViewModel(value: unknown): value is AnalyticsViewModel {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { version?: unknown }).version === ANALYTICS_VIEW_MODEL_VERSION
  );
}

export function getAnalyticsViewCacheKey(
  userId: string,
  target: AnalyticsViewCacheTarget,
): string {
  return `analytics:view:v1:${userId}:${target}`;
}

export async function getAnalyticsViewCacheKV(): Promise<AnalyticsViewCacheKV | null> {
  let cfContext: Awaited<ReturnType<typeof getCloudflareContext>> | null = null;
  try {
    cfContext = await getCloudflareContext({ async: true });
  } catch {
    return null;
  }

  if (!isCloudflareContextLike(cfContext)) {
    return null;
  }

  return isAnalyticsViewCacheKV(cfContext.env.HTML_CACHE) ? cfContext.env.HTML_CACHE : null;
}

export async function readAnalyticsViewCache<T extends AnalyticsViewCacheTarget>(
  kv: AnalyticsViewCacheKV | null,
  userId: string,
  target: T,
): Promise<AnalyticsViewModelForTarget<T> | null> {
  if (!kv) {
    return null;
  }

  const key = getAnalyticsViewCacheKey(userId, target);
  let raw: string | null;
  try {
    raw = await kv.get(key);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isVersionedAnalyticsViewModel(parsed)
      ? (parsed as AnalyticsViewModelForTarget<T>)
      : null;
  } catch {
    return null;
  }
}

export async function writeAnalyticsViewCache<T extends AnalyticsViewCacheTarget>(
  kv: AnalyticsViewCacheKV | null,
  userId: string,
  target: T,
  value: AnalyticsViewModelForTarget<T>,
): Promise<void> {
  if (!kv) {
    return;
  }

  const key = getAnalyticsViewCacheKey(userId, target);
  await kv.put(key, JSON.stringify(value));
}

export async function getOrBuildAnalyticsViewModel<T extends AnalyticsViewCacheTarget>({
  kv,
  userId,
  target,
  build,
}: {
  kv: AnalyticsViewCacheKV | null;
  userId: string;
  target: T;
  build: () => Promise<AnalyticsViewModelForTarget<T>>;
}): Promise<AnalyticsViewModelForTarget<T>> {
  const cached = await readAnalyticsViewCache(kv, userId, target);
  if (cached) {
    return cached;
  }

  const fresh = await build();
  try {
    await writeAnalyticsViewCache(kv, userId, target, fresh);
  } catch (err) {
    console.warn('[analytics-view-cache] put failed', {
      userId,
      target,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return fresh;
}
