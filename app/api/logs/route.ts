import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createLogExperienceUseCase, createGetAnalyticsUseCase } from '@/container/createUseCases';
import { VALID_DOMAINS, type Domain } from '@/core/domains/domain/Domain';
import { InMemoryQueue } from '@/infrastructure/jobs/InMemoryQueue';
import { createProcessExperienceWorkflow } from '@/container/createWorkflow';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { CreateExperienceDTO } from '@/application/dto/ExperienceDTO';
import type { LMConfig } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface LogRequestBody {
  date: string;
  obstacles: CreateExperienceDTO[];
  lmConfig?: LMConfig;
}

type KVNamespaceLike = {
  get: (...args: unknown[]) => unknown;
  put: (...args: unknown[]) => unknown;
  delete: (...args: unknown[]) => unknown;
};

function isKVNamespaceLike(value: unknown): value is KVNamespaceLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as KVNamespaceLike).get === 'function' &&
    typeof (value as KVNamespaceLike).put === 'function' &&
    typeof (value as KVNamespaceLike).delete === 'function'
  );
}

// キャッシュキー: ssr:v1:{userId}:{path}
function buildCacheKey(userId: string, pathname: string): string {
  const pathKey = pathname.replace(/\/$/, '').replace(/^\//, '').replace(/\//g, '-') || 'root';
  return `ssr:v1:${userId}:${pathKey}`;
}

const INVALIDATED_PAGES = ['/dashboard', '/logs', '/analytics'];

async function backgroundSave(
  kv: KVNamespace,
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null,
  body: LogRequestBody,
): Promise<void> {
  // Step 1: Supabase への書き込み（既存のユースケースをそのまま利用）
  try {
    const queue = new InMemoryQueue();
    if (body.lmConfig) {
      createProcessExperienceWorkflow(supabase, queue);
    }
    const useCase = createLogExperienceUseCase(supabase, queue);
    await useCase.execute(userId, { displayName }, body.obstacles, body.date, body.lmConfig);
  } catch (err) {
    console.error('[logs:bg] Supabase書き込み失敗:', err);
    return; // INSERT失敗時はキャッシュを触らない
  }

  // Step 2: ユーザー固有ページの KV キャッシュを無効化
  try {
    await Promise.allSettled(
      INVALIDATED_PAGES.map((p) => kv.delete(buildCacheKey(userId, p))),
    );
  } catch (err) {
    console.error('[logs:bg] KVキャッシュ無効化失敗:', err);
    // 非致命的: TTL（1時間）経過で自動削除される
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

    const { date, obstacles, lmConfig } = body;

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

    if (cfContext) {
      const htmlCache = cfContext.env.HTML_CACHE;
      if (isKVNamespaceLike(htmlCache)) {
        cfContext.ctx.waitUntil(
          backgroundSave(htmlCache, supabase, user.id, displayName, body),
        );
        return NextResponse.json(
          { message: '記録を受け付けました。バックグラウンドで処理中です。' },
          { status: 202 },
        );
      }

      console.warn(
        'Cloudflare KV binding "HTML_CACHE" is missing or invalid; falling back to synchronous log processing.',
      );
    }

    // ── ローカル next dev フォールバック（同期実行）──────────────────────────
    const queue = new InMemoryQueue();
    if (lmConfig) {
      createProcessExperienceWorkflow(supabase, queue);
    }
    const useCase = createLogExperienceUseCase(supabase, queue);
    await useCase.execute(user.id, { displayName }, obstacles, date, lmConfig);

    revalidateTag('analytics');

    const analytics = await createGetAnalyticsUseCase(supabase).execute(user.id);
    return NextResponse.json({
      message: '記録を保存しました。今日の一歩が未来を変えます。',
      summary: {
        confrontationRate: analytics.confrontationRate,
        avgStress7Days: analytics.avgStress7Days,
        streakDays: analytics.streakDays,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
