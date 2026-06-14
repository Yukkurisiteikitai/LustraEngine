'use client';

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import type {
  ActionResult,
  ChatMessage,
  ExperienceEmotion,
  LogPayload,
  LogResponse,
  TimeOfDay,
  UserModelSnapshot,
} from '@/types';
import { loadLMConfig } from '@/lib/lmConfig';

export interface PersonaPayload {
  snapshot: UserModelSnapshot | null;
  snapshotGenerationEnabled?: boolean;
  allowChatFallbackDraft?: boolean;
}

export function MockQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function postLog(payload: LogPayload): Promise<LogResponse> {
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();

  if (!response.ok) {
    const errorMessage = (json as { message?: string }).message || '記録の送信に失敗しました';
    throw new Error(errorMessage);
  }

  return json as LogResponse;
}

export function useSubmitLogMutation() {
  return useMutation({
    mutationFn: postLog,
  });
}

export interface ExtractedDiaryFields {
  description: string;
  context: string;
  timeOfDay: TimeOfDay;
  durationMinutes: number | null;
  emotions: ExperienceEmotion[];
  actionResult: ActionResult;
  trigger: string | null;
  needsTriggerQuestion: boolean;
  triggerQuestion: string | null;
  modelName: string;
}

export function useExtractDiaryMutation() {
  return useMutation({
    mutationFn: async (diaryText: string): Promise<ExtractedDiaryFields> => {
      const cfg = loadLMConfig();
      if (!cfg) {
        throw new Error('LM設定が見つかりません。設定ページでLMプロバイダーを設定してください。');
      }
      const response = await fetch('/api/logs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diaryText, lmConfig: cfg }),
      });
      const json = await response.json();
      if (!response.ok) {
        const message = (json as { message?: string }).message || 'AIによる読み取りに失敗しました';
        throw new Error(message);
      }
      return json as ExtractedDiaryFields;
    },
  });
}

async function fetchPersona(): Promise<PersonaPayload | null> {
  const response = await fetch('/api/persona');

  if (!response.ok) {
    const json = await response.json();
    const errorMessage = (json as { message?: string }).message || 'ペルソナ取得に失敗しました';
    throw new Error(errorMessage);
  }

  const json = (await response.json()) as PersonaPayload;
  return json;
}

export function usePersona() {
  return useQuery({
    queryKey: ['persona'],
    queryFn: fetchPersona,
  });
}

export function usePatternDetection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const cfg = loadLMConfig();
      if (!cfg) throw new Error('LM設定が見つかりません。設定ページでLMプロバイダーを設定してください。');

      const response = await fetch('/api/patterns/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lmConfig: cfg }),
      });

      const json = await response.json();
      if (!response.ok) {
        const errorMessage = (json as { message?: string }).message || 'パターン検出に失敗しました';
        throw new Error(errorMessage);
      }
      return json as { classified: number; message: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patterns'] });
    },
  });
}

export function useTraitInferenceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const cfg = loadLMConfig();
      if (!cfg) throw new Error('LM設定が見つかりません。設定ページでLMプロバイダーを設定してください。');

      const response = await fetch('/api/traits/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lmConfig: cfg }),
      });

      const json = await response.json();
      if (!response.ok) {
        const errorMessage = (json as { message?: string }).message || 'トレイト推論に失敗しました';
        throw new Error(errorMessage);
      }
      return json as { message: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['traits'] });
      void queryClient.invalidateQueries({ queryKey: ['persona'] });
    },
  });
}

export function useChatMutation() {
  return useMutation({
    mutationFn: async ({
      message,
      history,
      threadId,
    }: {
      message: string;
      history: ChatMessage[];
      threadId?: string;
    }) => {
      const cfg = loadLMConfig();
      if (!cfg) throw new Error('LM設定が見つかりません。設定ページで設定してください。');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, lmConfig: cfg, threadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { message?: string }).message ?? 'チャットに失敗しました');
      return json as {
        response?: string;
        threadId?: string;
        pairNodeId?: string;
        mode?: 'evidence_logging';
        reason?: string;
        questions?: string[];
        suggestedTemplate?: string;
      };
    },
  });
}
