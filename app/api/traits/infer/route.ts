import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createInferTraitsUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import { createRepositories } from '@/container/createRepositories';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import type { LMConfig } from '@/types';

interface InferRequestBody {
  lmConfig?: LMConfig;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(req, 8 * 1024);
    let body: InferRequestBody;
    try {
      body = (await req.json()) as InferRequestBody;
    } catch {
      throw new ValidationError('InferRequestBodyの形式JSONが不正です。');
    }

    const { lmConfig } = body;
    const { llmSettings } = createRepositories(supabase);
    const resolvedLlmConfig = await resolveStoredLlmConfig(
      user.id,
      lmConfig,
      llmSettings,
      process.env.LLM_SETTINGS_ENCRYPTION_KEY,
    );

    const useCase = createInferTraitsUseCase(supabase, createLLM(resolvedLlmConfig));
    const result = await useCase.execute(user.id, undefined);

    return NextResponse.json({
      hypotheses: result.hypotheses,
      summary: result.summary,
      message: 'ユーザーモデル要約を更新しました',
    });
  } catch (err) {
    return handleError(err);
  }
}
