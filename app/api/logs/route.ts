import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createLogExperienceUseCase } from '@/container/createUseCases';
import { refreshAnalyticsViewCache } from '@/container/loadAnalyticsViewModel';
import {
  getAnalyticsViewCacheKV,
  type AnalyticsViewCacheKV,
} from '@/infrastructure/cache/AnalyticsViewCache';
import { VALID_DOMAINS, type Domain } from '@/core/domains/domain/Domain';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { CreateExperienceDTO } from '@/application/dto/ExperienceDTO';
import type { SupabaseClient } from '@supabase/supabase-js';

interface LogRequestBody {
  date: string;
  obstacles: CreateExperienceDTO[];
}

type CloudflareContextLike = {
  env: {
    HTML_CACHE?: unknown;
  };
  ctx: {
    waitUntil: (promise: Promise<unknown>) => void;
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

  const maybe = value as {
    env?: { HTML_CACHE?: unknown };
    ctx?: { waitUntil?: unknown };
  };

  return (
    typeof maybe.env === 'object' &&
    maybe.env !== null &&
    typeof maybe.ctx === 'object' &&
    maybe.ctx !== null &&
    typeof maybe.ctx.waitUntil === 'function'
  );
}

async function backgroundSave(
  kv: AnalyticsViewCacheKV,
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null,
  body: LogRequestBody,
): Promise<void> {
  // Step 1: Supabase への書き込み
  try {
    const useCase = createLogExperienceUseCase(supabase);
    await useCase.execute(userId, { displayName }, body.obstacles, body.date);
  } catch (err) {
    console.error('[logs:bg] Supabase書き込み失敗:', err);
    return; // INSERT失敗時はキャッシュを触らない
  }

  // Step 2: Home/Dashboard用の軽量Analytics View JSONを再生成してKVへ保存
  try {
    await refreshAnalyticsViewCache(supabase, userId, kv);
  } catch (err) {
    console.error('[logs:bg] Analytics View cache更新失敗:', err);
    // 非致命的: 次回表示時はDB fallbackでViewModelを再生成できる
  }
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { data: experiences, error } = await supabase
      .from('experiences')
      .select('*')
      .eq('user_id', user.id)
      .is('soft_deleted_at', null)
      .gte('logged_at', new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10))
      .order('logged_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ experiences });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(request, 16 * 1024);
    let body: LogRequestBody;
    try {
      body = (await request.json()) as LogRequestBody;
    } catch {
      throw new ValidationError('LogRequestBodyの形式ではないJSONの形式です。');
    }

    const { date, obstacles } = body;

    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('dateはYYYY-MM-DD形式で必須です');
    }
    if (!Array.isArray(obstacles) || obstacles.length === 0) {
      throw new ValidationError('obstaclesは1件以上必須です');
    }
    for (const obs of obstacles) {
      if (typeof obs.description !== 'string' || obs.description.trim() === '') {
        throw new ValidationError('descriptionは必須です');
      }
      if (!VALID_DOMAINS.includes(obs.domain as Domain)) {
        throw new ValidationError('domainはWORK, RELATIONSHIP, HEALTH, MONEY, SELFのいずれかで指定してください');
      }
      if (typeof obs.stressLevel !== 'number' || obs.stressLevel < 1 || obs.stressLevel > 5) {
        throw new ValidationError('stressLevelは1〜5の数値で指定してください');
      }
      if (obs.reportDifficulty !== undefined && (typeof obs.reportDifficulty !== 'number' || obs.reportDifficulty < 1 || obs.reportDifficulty > 5)) {
        throw new ValidationError('reportDifficultyは1〜5の数値で指定してください');
      }
      if (obs.careful !== undefined && typeof obs.careful !== 'boolean') {
        throw new ValidationError('carefulはbooleanで指定してください');
      }
      if (obs.actionResult !== 'AVOIDED' && obs.actionResult !== 'CONFRONTED') {
        throw new ValidationError('actionResultはAVOIDEDまたはCONFRONTEDで指定してください');
      }
    }

    const displayName =
      typeof user.user_metadata?.display_name === 'string'
        ? (user.user_metadata.display_name as string)
        : null;

    // Cloudflare コンテキストが取れる場合（wrangler dev / 本番）は
    // ctx.waitUntil() で書き込みをバックグラウンドへ回して 202 を即返す。
    // next dev（CF なし）では同期実行して従来どおり 200 + analyticsを返す。
    let cfContext: Awaited<ReturnType<typeof getCloudflareContext>> | null = null;
    try {
      cfContext = await getCloudflareContext({ async: true });
    } catch {
      // ローカル next dev 環境では getCloudflareContext が使えないため無視
    }

    if (isCloudflareContextLike(cfContext)) {
      const analyticsViewCache = cfContext.env.HTML_CACHE;
      if (isAnalyticsViewCacheKV(analyticsViewCache)) {
        cfContext.ctx.waitUntil(
          backgroundSave(analyticsViewCache, supabase, user.id, displayName, body),
        );
        return NextResponse.json(
          {
            ok: true,
            status: 'log_saved',
            message: '記録しました。',
            analysis: {
              status: 'pending',
              next: 'daily_or_manual',
            },
          },
          { status: 202 },
        );
      }

      console.warn(
        'Cloudflare Analytics View cache binding is missing or invalid; falling back to synchronous log processing.',
      );
    }

    // ── ローカル next dev フォールバック（同期実行）──────────────────────────
    const useCase = createLogExperienceUseCase(supabase);
    await useCase.execute(user.id, { displayName }, obstacles, date);
    try {
      const analyticsViewCache = await getAnalyticsViewCacheKV();
      await refreshAnalyticsViewCache(supabase, user.id, analyticsViewCache);
    } catch (err) {
      console.error('[logs] Analytics View cache更新失敗:', err);
    }

    return NextResponse.json({
      ok: true,
      status: 'log_saved',
      message: '記録しました。',
      analysis: {
        status: 'pending',
        next: 'daily_or_manual',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
