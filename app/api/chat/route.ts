import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createChatUseCase, createThreadUseCase, createSaveChatMessageUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { RateLimitError } from '@/core/errors/RateLimitError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import { createChatRateLimiter } from '@/infrastructure/rate-limiting/rateLimiterSingleton';
import { logger } from '@/infrastructure/observability/logger';
import type { ChatMessage, LMConfig } from '@/types';

interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
  lmConfig?: LMConfig;
  threadId?: string;
}

export async function POST(req: Request) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();

  logger.info('api:chat_request_start', {
    layer: 'ChatRoute',
    reqId,
    contentLength: req.headers.get('content-length'),
    userAgent: req.headers.get('user-agent')?.slice(0, 80),
  });

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    logger.info('api:chat_auth_ok', { layer: 'ChatRoute', reqId, userId: user.id });

    // Parse and validate body first — provider must be known before rate limiting.
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

    // Rate limiting applies to Claude only.
    // Local LLM (LM Studio) is exempt — no token budget tracking.
    const isClaude = lmConfig.provider === 'claude';
    const rateLimiter = isClaude ? createChatRateLimiter() : null;

    if (rateLimiter) {
      const status = await rateLimiter.check(user.id);

      if (!status.allowed) {
        logger.error('api:chat_rate_limit_exceeded', {
          layer: 'ChatRoute',
          reqId,
          userId: user.id,
          usedTokens: status.usedTokens,
          maxTokens: status.maxTokens,
          retryAfterSeconds: status.retryAfterSeconds,
        });
        throw new RateLimitError(
          `トークン制限に達しました。${status.retryAfterSeconds}秒後に再試行してください。`,
          {
            userId: user.id,
            usedTokens: status.usedTokens,
            maxTokens: status.maxTokens,
            retryAfterSeconds: status.retryAfterSeconds,
          },
        );
      }

      // Predictive stop: if the remaining budget is less than one average request,
      // the next LLM call would very likely push usage over the limit.
      if (status.requestCount > 0 && status.remainingTokens < status.avgTokensPerRequest) {
        const estimatedRemaining = Math.floor(status.remainingTokens / status.avgTokensPerRequest);
        logger.warn('api:chat_predictive_limit', {
          layer: 'ChatRoute',
          reqId,
          userId: user.id,
          remainingTokens: status.remainingTokens,
          avgTokensPerRequest: status.avgTokensPerRequest,
          estimatedRemainingRequests: estimatedRemaining,
          retryAfterSeconds: status.retryAfterSeconds,
        });
        throw new RateLimitError(
          `トークン予算が不足しています（推定残り${estimatedRemaining}回）。${status.retryAfterSeconds}秒後に再試行してください。`,
          {
            userId: user.id,
            usedTokens: status.usedTokens,
            maxTokens: status.maxTokens,
            retryAfterSeconds: status.retryAfterSeconds,
          },
        );
      }

      logger.info('api:chat_rate_limit_ok', {
        layer: 'ChatRoute',
        reqId,
        userId: user.id,
        usedTokens: status.usedTokens,
        maxTokens: status.maxTokens,
        remainingTokens: status.remainingTokens,
        avgTokensPerRequest: status.avgTokensPerRequest,
        requestCount: status.requestCount,
      });
    }

    logger.info('api:chat_llm_call_start', {
      layer: 'ChatRoute',
      reqId,
      userId: user.id,
      provider: lmConfig.provider,
      messageChars: message.length,
      historyLength: history?.length ?? 0,
      threadId: threadId ?? null,
      elapsedMs: Date.now() - t0,
    });

    const tLlm = Date.now();
    const useCase = createChatUseCase(supabase, createLLM(lmConfig, { waitForSlot: false, endpoint: '/api/chat' }));
    const result = await useCase.execute(user.id, message, history ?? []);

    logger.info('api:chat_llm_call_done', {
      layer: 'ChatRoute',
      reqId,
      userId: user.id,
      llmMs: Date.now() - tLlm,
      personaMissing: result.personaMissing ?? false,
      modelName: result.modelName,
      tokenUsage: result.tokenUsage,
    });

    if (result.personaMissing) {
      return NextResponse.json(
        {
          message:
            'ペルソナスナップショットが見つかりません。先にペルソナページでトレイト推論を実行してください。',
        },
        { status: 422 },
      );
    }

    // Record token usage for Claude. LLM already ran — always record, never reject.
    // The next pre-flight predictive check will block future requests if over budget.
    if (rateLimiter && result.tokenUsage != null) {
      await rateLimiter.record(user.id, result.tokenUsage.total);
      logger.info('api:chat_tokens_recorded', {
        reqId,
        userId: user.id,
        tokenUsage: result.tokenUsage,
      });
    }

    // Persist messages to DB (fire-and-forget errors don't fail the response)
    let resolvedThreadId = threadId;
    let resolvedPairNodeId: string | undefined;
    try {
      const saveUseCase = createSaveChatMessageUseCase(supabase);

      if (!resolvedThreadId) {
        const threadUseCase = createThreadUseCase(supabase);
        const thread = await threadUseCase.execute(user.id, message.slice(0, 50));
        resolvedThreadId = thread.id;
      }

      const { pairNodeId } = await saveUseCase.execute(
        resolvedThreadId, user.id, message, result.response,
        { tokenUsage: result.tokenUsage, modelName: result.modelName },
      );
      resolvedPairNodeId = pairNodeId;
    } catch (persistErr) {
      logger.error('api:chat_persist_failed', {
        layer: 'ChatRoute',
        reqId,
        userId: user.id,
        err: persistErr instanceof Error ? persistErr.message : String(persistErr),
        stack: persistErr instanceof Error ? persistErr.stack : undefined,
      });
    }

    logger.info('api:chat_request_done', {
      layer: 'ChatRoute',
      reqId,
      userId: user.id,
      totalMs: Date.now() - t0,
      threadId: resolvedThreadId,
    });

    return NextResponse.json({ response: result.response, threadId: resolvedThreadId, pairNodeId: resolvedPairNodeId });
  } catch (err) {
    logger.error('api:chat_request_failed', {
      layer: 'ChatRoute',
      reqId,
      totalMs: Date.now() - t0,
      errType: err instanceof Error ? err.constructor.name : typeof err,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return handleError(err);
  }
}
