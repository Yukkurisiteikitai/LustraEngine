import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createInferTraitsUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { LMConfig } from '@/types';

interface InferRequestBody {
  lmConfig: LMConfig;
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
    if (!lmConfig?.provider || !['claude', 'lmstudio'].includes(lmConfig.provider)) {
      throw new ValidationError('lmConfig.provider が不正です（claude または lmstudio）');
    }
    if (lmConfig.provider === 'claude' && !lmConfig.claudeApiKey) {
      throw new ValidationError('Claude API キーが設定されていません');
    }

    const useCase = createInferTraitsUseCase(supabase, createLLM(lmConfig));
    const { traits } = await useCase.execute(user.id);

    revalidateTag('traits');
    revalidateTag('persona');

    return NextResponse.json({ traits, message: 'トレイト推論が完了しました' });
  } catch (err) {
    return handleError(err);
  }
}
