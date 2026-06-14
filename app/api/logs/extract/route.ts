import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createExtractStructuredDiaryUseCase } from '@/container/createUseCases';
import { createRepositories } from '@/container/createRepositories';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import { logger } from '@/infrastructure/observability/logger';
import type { LMConfig } from '@/types';

interface ExtractRequestBody {
  diaryText: string;
  lmConfig?: LMConfig;
}

export async function POST(req: Request) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(req, 32 * 1024);
    let body: ExtractRequestBody;
    try {
      body = (await req.json()) as ExtractRequestBody;
    } catch {
      throw new ValidationError('ExtractRequestBody形式のJSONが不正です。');
    }

    const { diaryText, lmConfig } = body;
    if (typeof diaryText !== 'string' || diaryText.trim() === '') {
      throw new ValidationError('diaryTextは必須です');
    }
    if (!lmConfig) {
      throw new ValidationError('LLM設定が必要です');
    }

    const { llmSettings } = createRepositories(supabase);
    const resolvedLlmConfig = await resolveStoredLlmConfig(
      user.id,
      lmConfig,
      llmSettings,
      process.env.LLM_SETTINGS_ENCRYPTION_KEY,
    );

    logger.info('api:logs_extract_llm_call_start', {
      layer: 'LogsExtractRoute',
      reqId,
      userId: user.id,
      provider: resolvedLlmConfig.provider,
      diaryChars: diaryText.length,
    });

    const useCase = createExtractStructuredDiaryUseCase(
      createLLM(resolvedLlmConfig, { waitForSlot: false, endpoint: '/api/logs/extract' }),
    );
    const result = await useCase.execute({ diaryText });

    logger.info('api:logs_extract_done', {
      layer: 'LogsExtractRoute',
      reqId,
      userId: user.id,
      totalMs: Date.now() - t0,
      modelName: result.modelName,
    });

    // Intentionally do NOT include rawText in the public response — clients only
    // need the structured fields. rawText stays in server logs for debugging.
    return NextResponse.json({
      description: result.description,
      context: result.context,
      timeOfDay: result.timeOfDay,
      durationMinutes: result.durationMinutes,
      emotions: result.emotions,
      actionResult: result.actionResult,
      trigger: result.trigger,
      needsTriggerQuestion: result.needsTriggerQuestion,
      triggerQuestion: result.triggerQuestion,
      modelName: result.modelName,
    });
  } catch (err) {
    logger.error('api:logs_extract_failed', {
      layer: 'LogsExtractRoute',
      reqId,
      totalMs: Date.now() - t0,
      errType: err instanceof Error ? err.constructor.name : typeof err,
      err: err instanceof Error ? err.message : String(err),
    });
    return handleError(err);
  }
}
