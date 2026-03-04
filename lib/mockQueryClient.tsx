'use client';

import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import type { LogPayload, LogResponse } from '@/types';

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

  if (!response.ok) {
    throw new Error('記録の送信に失敗しました');
  }

  return (await response.json()) as LogResponse;
}

export function useSubmitLogMutation() {
  return useMutation({
    mutationFn: postLog,
  });
}
