import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createLogExperienceUseCase, createGetAnalyticsUseCase } from '@/container/createUseCases';
import { VALID_DOMAINS, type Domain } from '@/core/domains/domain/Domain';
import { InMemoryQueue } from '@/infrastructure/jobs/InMemoryQueue';
import { createProcessExperienceWorkflow } from '@/container/createWorkflow';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
import type { CreateExperienceDTO } from '@/application/dto/ExperienceDTO';
import type { LMConfig } from '@/types';

interface LogRequestBody {
  date: string;
  obstacles: CreateExperienceDTO[];
  lmConfig?: LMConfig;
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

    let body: LogRequestBody;
    try {
      body = (await request.json()) as LogRequestBody;
    } catch {
      throw new ValidationError('JSONの形式が不正です');
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

    const queue = new InMemoryQueue();
    if (lmConfig) {
      createProcessExperienceWorkflow(supabase, queue);
    }

    const useCase = createLogExperienceUseCase(supabase, queue);
    await useCase.execute(user.id, { displayName }, obstacles, date, lmConfig);

    revalidateTag('analytics', {});

    // Return analytics summary
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
