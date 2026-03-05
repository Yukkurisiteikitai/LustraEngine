'use client';

import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import type { ExperienceRecord, LogPayload, LogResponse } from '@/types';

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

async function fetchExperiences(): Promise<ExperienceRecord[]> {
  const response = await fetch('/api/logs');

  if (!response.ok) {
    throw new Error('記録の取得に失敗しました');
  }

  const json = (await response.json()) as { experiences: Array<{
    id: string;
    logged_at: string;
    description: string;
    stress_level: number;
    action_result: string;
    action_memo: string | null;
    goal: string | null;
    action: string | null;
    emotion: string | null;
    context: string | null;
    domain_id: string | null;
  }> };

  // DB の snake_case → フロントの camelCase に変換
  return json.experiences.map((e) => ({
    id: e.id,
    date: e.logged_at,
    description: e.description,
    stressLevel: e.stress_level,
    // Phase 3 で domain_id → domain 名解決に変更予定
    domain: 'WORK' as const,
    actionResult: e.action_result as 'AVOIDED' | 'CONFRONTED',
    actionMemo: e.action_memo ?? undefined,
    goal: e.goal ?? undefined,
    action: e.action ?? undefined,
    emotion: e.emotion ?? undefined,
    context: e.context ?? undefined,
  }));
}

export function useExperiences() {
  return useQuery({
    queryKey: ['experiences'],
    queryFn: fetchExperiences,
  });
}

interface AnalyticsData {
  confrontationRate: number;
  avgStress7Days: number;
  stressTrend: number[];
  streakDays: number;
  recentExperiences: Array<{
    id: string;
    date: string;
    description: string;
    stressLevel: number;
    actionResult: string;
    domain: string;
  }>;
}

async function fetchAnalytics(): Promise<AnalyticsData> {
  const response = await fetch('/api/analytics');

  if (!response.ok) {
    const json = await response.json();
    const errorMessage = (json as { message?: string }).message || '分析データの取得に失敗しました';
    throw new Error(errorMessage);
  }

  return (await response.json()) as AnalyticsData;
}

export function useAnalytics() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
  });
}
