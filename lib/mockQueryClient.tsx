'use client';

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import type {
  ChatMessage,
  LogPayload,
  LogResponse,
  PersonaSnapshot,
} from '@/types';
import { loadLMConfig } from '@/lib/lmConfig';

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

async function fetchPersona(): Promise<PersonaSnapshot | null> {
  const response = await fetch('/api/persona');

  if (!response.ok) {
    const json = await response.json();
    const errorMessage = (json as { message?: string }).message || 'ペルソナ取得に失敗しました';
    throw new Error(errorMessage);
  }

  const json = (await response.json()) as { snapshot: PersonaSnapshot | null };
  return json.snapshot;
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
      return json as { response: string; threadId?: string };
    },
  });
}
