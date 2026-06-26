import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createVerifyTraitHypothesisUseCase } from '@/container/createUseCases';
import { createRepositories } from '@/container/createRepositories';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { LMConfig } from '@/types';

interface VerifyRequestBody {
  action: 'confirm' | 'revise' | 'hold';
  correction?: string;
  lmConfig?: LMConfig;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { id } = await params;
    if (!id) throw new ValidationError('idが必要です');

    checkBodySize(req, 8 * 1024);
    let body: VerifyRequestBody;
    try {
      body = (await req.json()) as VerifyRequestBody;
    } catch {
      throw new ValidationError('VerifyRequestBodyのJSONが不正です');
    }

    const { action, correction, lmConfig } = body;
    if (action !== 'confirm' && action !== 'revise' && action !== 'hold') {
      throw new ValidationError('actionはconfirm、revise、holdのいずれかで指定してください');
    }

    if (action === 'revise') {
      if (!correction || correction.trim() === '') {
        throw new ValidationError('reviseアクションにはcorrectionテキストが必要です');
      }

      const { llmSettings } = createRepositories(supabase);
      const resolvedLlmConfig = await resolveStoredLlmConfig(
        user.id,
        lmConfig,
        llmSettings,
        process.env.LLM_SETTINGS_ENCRYPTION_KEY,
      );

      const useCase = createVerifyTraitHypothesisUseCase(
        supabase,
        createLLM(resolvedLlmConfig, { waitForSlot: false, endpoint: 'hypotheses-verify' }),
      );
      const result = await useCase.revise(user.id, id, correction.trim());
      return NextResponse.json({ hypothesis: result });
    }

    // confirm and hold don't need LLM — create use case without LLM
    const { traitHypothesis } = createRepositories(supabase);
    if (action === 'confirm') {
      const result = await traitHypothesis.confirm(id, user.id);
      return NextResponse.json({ hypothesis: result });
    }

    // hold
    const result = await traitHypothesis.hold(id, user.id);
    return NextResponse.json({ hypothesis: result });
  } catch (err) {
    return handleError(err);
  }
}
