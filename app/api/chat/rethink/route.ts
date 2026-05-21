import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRethinkMessageUseCase, createGetThreadHistoryUseCase } from '@/container/createUseCases';
import { createRepositories } from '@/container/createRepositories';
import { createStreamingAdapter } from '@/infrastructure/llm/createStreamingAdapter';
import { buildChatSystemPrompt } from '@/application/llm/chatSystemPrompt';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { RateLimitError } from '@/core/errors/RateLimitError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import { createChatRateLimiter } from '@/infrastructure/rate-limiting/rateLimiterSingleton';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import type { LMConfig } from '@/types';
import { buildEvidenceLoggingFallback } from '@/application/llm/evidenceLoggingFallback';

interface RethinkRequestBody {
  pairNodeId: string;
  newPrompt: string;
  threadId: string;
  lmConfig: LMConfig;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const rateLimiter = createChatRateLimiter();
    const rateLimitStatus = await rateLimiter.check(user.id);
    if (!rateLimitStatus.allowed) {
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

    checkBodySize(req, 16 * 1024);
    let body: RethinkRequestBody;
    try {
      body = (await req.json()) as RethinkRequestBody;
    } catch {
      throw new ValidationError('リクエストのJSON形式が不正です。');
    }

    const { pairNodeId, newPrompt, threadId, lmConfig } = body;

    if (!pairNodeId) throw new ValidationError('pairNodeId が必要です');
    if (!threadId) throw new ValidationError('threadId が必要です');
    const { llmSettings, userSettings } = createRepositories(supabase);
    const resolvedLlmConfig = await resolveStoredLlmConfig(
      user.id,
      lmConfig,
      llmSettings,
      process.env.LLM_SETTINGS_ENCRYPTION_KEY,
    );

    // Run all independent DB queries in parallel after auth
    const historyUseCase = createGetThreadHistoryUseCase(supabase);
    const { experience, psychology, traitHypothesis } = createRepositories(supabase);
    const settings = await userSettings.ensureDefaultByUser(user.id);
    const [allMessages, activeHypotheses, experiences, bigFive, attachment, identityStatus] =
      await Promise.all([
        historyUseCase.getMessages(threadId),
        traitHypothesis.findActiveByUser(user.id),
        experience.findRecent(user.id, 5, { visibility: 'analysis_allowed' }),
        psychology.getBigFiveScore(user.id),
        psychology.getAttachmentProfile(user.id),
        psychology.getIdentityStatus(user.id),
      ]);

    // Find user message at this pair_node and build prior history
    const pairNodeUserMsgIdx = allMessages.findIndex(
      (m) => m.pairNodeId === pairNodeId && m.role === 'user',
    );
    if (pairNodeUserMsgIdx === -1) {
      throw new ValidationError('指定したペアノードが見つかりません');
    }

    const originalUserMsg = allMessages[pairNodeUserMsgIdx].content;
    const effectivePrompt = newPrompt?.trim() || originalUserMsg;
    const priorHistory = allMessages
      .slice(0, pairNodeUserMsgIdx)
      .map((m) => ({ role: m.role, content: m.content }));

    // Build system prompt from active trait hypotheses + recent experiences + psychology profile
    if (activeHypotheses.length === 0) {
      return NextResponse.json(
        buildEvidenceLoggingFallback({
          allowChatFallbackDraft: settings.allowChatFallbackDraft,
        }),
      );
    }
    const systemPrompt = buildChatSystemPrompt(
      experiences,
      activeHypotheses,
      bigFive,
      attachment,
      identityStatus,
    );

    // Build the full user message (same format as ChatUseCase)
    const historyText = priorHistory.map((m) => `${m.role}: ${m.content}`).join('\n');
    const fullUserMessage = historyText
      ? `${historyText}\nuser: ${effectivePrompt}`
      : effectivePrompt;

    // Stream the LLM response
    const adapter = createStreamingAdapter(resolvedLlmConfig);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          for await (const chunk of adapter.generateStream(systemPrompt, fullUserMessage, 1024)) {
            fullText += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          }

          // DB save after streaming completes (before sending done event)
          if (settings.allowChatHistorySave) {
            const rethinkUseCase = createRethinkMessageUseCase(supabase);
            await rethinkUseCase.execute(pairNodeId, user.id, fullText);
          }

          // Atomically check budget and record usage to prevent concurrent over-spend
          const estimatedTokens = Math.ceil(fullText.length / 3);
          await rateLimiter.checkAndRecord(user.id, estimatedTokens);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'エラーが発生しました';
          // DB is NOT updated on failure — existing select_message_id is preserved
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
