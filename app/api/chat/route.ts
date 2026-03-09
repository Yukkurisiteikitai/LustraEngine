import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createChatUseCase, createThreadUseCase, createSaveChatMessageUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
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

    const useCase = createChatUseCase(supabase, createLLM(lmConfig));
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
        saveUseCase.execute(resolvedThreadId, user.id, 'assistant', result.response),
      ]);
    } catch {
      // persistence errors are non-fatal — chat response is already computed
    }

    return NextResponse.json({ response: result.response, threadId: resolvedThreadId });
  } catch (err) {
    return handleError(err);
  }
}
