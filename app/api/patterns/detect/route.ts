import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createDetectPatternsUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
import type { LMConfig } from '@/types';

interface DetectRequestBody {
  lmConfig: LMConfig;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    let body: DetectRequestBody;
    try {
      body = (await req.json()) as DetectRequestBody;
    } catch {
      throw new ValidationError('JSONの形式が不正です');
    }

    const { lmConfig } = body;
    if (!lmConfig?.provider || !['claude', 'lmstudio'].includes(lmConfig.provider)) {
      throw new ValidationError('lmConfig.provider が不正です（claude または lmstudio）');
    }
    if (lmConfig.provider === 'claude' && !lmConfig.claudeApiKey) {
      throw new ValidationError('Claude API キーが設定されていません');
    }

    const useCase = createDetectPatternsUseCase(supabase, createLLM(lmConfig));
    const { classified } = await useCase.execute(user.id);

    revalidateTag('patterns', {});

    return NextResponse.json({
      classified,
      message: `${classified}件の記録を分析しました`,
    });
  } catch (err) {
    return handleError(err);
  }
}
