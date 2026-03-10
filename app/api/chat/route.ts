import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createChatUseCase, createThreadUseCase, createSaveChatMessageUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { RateLimitError } from '@/core/errors/RateLimitError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import { chatRateLimiter } from '@/infrastructure/rate-limiting/rateLimiterSingleton';
import { logger } from '@/infrastructure/observability/logger';
import type { ChatMessage, LMConfig } from '@/types';

interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
  lmConfig?: LMConfig;
  threadId?: string;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    // Per-user token budget check
    const rateLimitStatus = chatRateLimiter.check(user.id);
    if (!rateLimitStatus.allowed) {
      logger.error('api:chat_rate_limit_exceeded', {
        layer: 'ChatRoute',
        operation: 'POST /api/chat',
        userId: user.id,
        usedTokens: rateLimitStatus.usedTokens,
        maxTokens: rateLimitStatus.maxTokens,
        retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
      });
      throw new RateLimitError(
        `トークン制限に達しました。${rateLimitStatus.retryAfterSeconds}秒後に再試行してください。`,
        {
          userId: user.id,
          usedTokens: rateLimitStatus.usedTokens,
          maxTokens: rateLimitStatus.maxTokens,
          retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
        },
      );
    }

    checkBodySize(req, 128 * 1024);
    let body: ChatRequestBody;
    try {
      body = (await req.json()) as ChatRequestBody;
    } catch {
      throw new ValidationError('ChatRequestBody形式のJSONが不正です。');
    }

    const { message, history, lmConfig, threadId } = body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      throw new ValidationError('メッセージが空です');
    }
    if (!lmConfig?.provider || !['claude', 'lmstudio'].includes(lmConfig.provider)) {
      throw new ValidationError('lmConfig.provider が不正です（claude または lmstudio）');
    }
    if (lmConfig.provider === 'claude' && !lmConfig.claudeApiKey) {
      throw new ValidationError('Claude API キーが設定されていません');
    }

    const useCase = createChatUseCase(supabase, createLLM(lmConfig, { waitForSlot: false, endpoint: '/api/chat' }));
    const result = await useCase.execute(user.id, message, history ?? []);

    if (result.personaMissing) {
      return NextResponse.json(
        {
          message:
            'ペルソナスナップショットが見つかりません。先にペルソナページでトレイト推論を実行してください。',
        },
        { status: 422 },
      );
    }

    // Record token usage for rate limiting
    if (result.tokenCount) {
      chatRateLimiter.record(user.id, result.tokenCount);
      logger.info('api:chat_tokens_recorded', {
        userId: user.id,
        tokenCount: result.tokenCount,
        newUsedTotal: rateLimitStatus.usedTokens + result.tokenCount,
      });
    }

    // Persist messages to DB (fire-and-forget errors don't fail the response)
    let resolvedThreadId = threadId;
    try {
      const saveUseCase = createSaveChatMessageUseCase(supabase);

      if (!resolvedThreadId) {
        const threadUseCase = createThreadUseCase(supabase);
        const thread = await threadUseCase.execute(user.id, message.slice(0, 50));
        resolvedThreadId = thread.id;
      }

      await Promise.all([
        saveUseCase.execute(resolvedThreadId, user.id, 'user', message),
        saveUseCase.execute(resolvedThreadId, user.id, 'assistant', result.response, {
          tokenCount: result.tokenCount,
          modelName: result.modelName,
        }),
      ]);
    } catch {
      // persistence errors are non-fatal — chat response is already computed
    }

    return NextResponse.json({ response: result.response, threadId: resolvedThreadId });
  } catch (err) {
    return handleError(err);
  }
}
