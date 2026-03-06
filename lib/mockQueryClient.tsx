'use client';

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import type {
  ChatMessage,
  ExperienceRecord,
  LogPayload,
  LogResponse,
  PatternsResponse,
  PersonaSnapshot,
  Trait,
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

async function fetchPatterns(): Promise<PatternsResponse> {
  const response = await fetch('/api/patterns');

  if (!response.ok) {
    const json = await response.json();
    const errorMessage = (json as { message?: string }).message || 'パターン取得に失敗しました';
    throw new Error(errorMessage);
  }

  return (await response.json()) as PatternsResponse;
}

export function usePatterns() {
  return useQuery({
    queryKey: ['patterns'],
    queryFn: fetchPatterns,
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

async function fetchTraits(): Promise<Trait[]> {
  const response = await fetch('/api/traits');

  if (!response.ok) {
    const json = await response.json();
    const errorMessage = (json as { message?: string }).message || 'トレイト取得に失敗しました';
    throw new Error(errorMessage);
  }

  const json = (await response.json()) as { traits: Trait[] };
  return json.traits;
}

export function useTraits() {
  return useQuery({
    queryKey: ['traits'],
    queryFn: fetchTraits,
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
    mutationFn: async ({ message, history }: { message: string; history: ChatMessage[] }) => {
      const cfg = loadLMConfig();
      if (!cfg) throw new Error('LM設定が見つかりません。設定ページで設定してください。');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, lmConfig: cfg }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { message?: string }).message ?? 'チャットに失敗しました');
      return json as { response: string };
    },
  });
}
