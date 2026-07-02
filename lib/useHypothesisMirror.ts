'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadLMConfig } from '@/lib/lmConfig';

export interface LiveHypothesis {
  id: string;
  traitKey: string;
  hypothesisLabel: string;
  hypothesisText: string;
  confidence: number;
  uncertainty: number;
  status: string;
  source: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface HypothesisHistoryEntry extends LiveHypothesis {
  revisedFromId: string | null;
  userCorrection: string | null;
}

export function useLiveHypotheses() {
  return useQuery({
    queryKey: ['hypotheses', 'live'],
    queryFn: async (): Promise<LiveHypothesis[]> => {
      const res = await fetch('/api/hypotheses');
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { message?: string }).message ?? '仮説の取得に失敗しました';
        throw new Error(message);
      }
      return (json as { hypotheses: LiveHypothesis[] }).hypotheses;
    },
  });
}

export function useHypothesisHistory(traitKey: string | null) {
  return useQuery({
    queryKey: ['hypotheses', 'history', traitKey],
    enabled: !!traitKey,
    queryFn: async (): Promise<HypothesisHistoryEntry[]> => {
      const res = await fetch(`/api/hypotheses/${encodeURIComponent(traitKey!)}/history`);
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { message?: string }).message ?? '仮説履歴の取得に失敗しました';
        throw new Error(message);
      }
      return (json as { history: HypothesisHistoryEntry[] }).history;
    },
  });
}

export function useVerifyHypothesis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
      correction,
    }: {
      id: string;
      action: 'confirm' | 'revise' | 'hold';
      correction?: string;
    }): Promise<LiveHypothesis> => {
      const cfg = loadLMConfig();
      const res = await fetch(`/api/hypotheses/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(correction !== undefined ? { correction } : {}),
          ...(cfg ? { lmConfig: cfg } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { message?: string }).message ?? '仮説の検証に失敗しました';
        throw new Error(message);
      }
      return (json as { hypothesis: LiveHypothesis }).hypothesis;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hypotheses', 'live'] });
      void queryClient.invalidateQueries({ queryKey: ['hypotheses', 'history'] });
    },
  });
}
