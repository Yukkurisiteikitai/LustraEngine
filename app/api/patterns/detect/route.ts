import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createDetectPatternsUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import { createRepositories } from '@/container/createRepositories';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import type { LMConfig } from '@/types';

interface DetectRequestBody {
  lmConfig?: LMConfig;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(req, 8 * 1024);
    let body: DetectRequestBody;
    try {
      body = (await req.json()) as DetectRequestBody;
    } catch {
      throw new ValidationError('DetectRequestBodyの形式JSONが不正です。');
    }

    const { lmConfig } = body;
    const { llmSettings } = createRepositories(supabase);
    const resolvedLlmConfig = await resolveStoredLlmConfig(
      user.id,
      lmConfig,
      llmSettings,
      process.env.LLM_SETTINGS_ENCRYPTION_KEY,
    );

    const useCase = createDetectPatternsUseCase(supabase, createLLM(resolvedLlmConfig));
    const { classified } = await useCase.execute(user.id);

    revalidateTag('patterns');

    return NextResponse.json({
      classified,
      message: `${classified}件の記録を分析しました`,
    });
  } catch (err) {
    return handleError(err);
  }
}
