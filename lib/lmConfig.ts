'use client';

import type { LMConfig } from '@/types';

const LS_KEY = 'recengine_lm_config';

export function loadLMConfig(): LMConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LMConfig;
  } catch {
    return null;
  }
}

export function saveLMConfig(config: LMConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

export function clearLMConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_KEY);
}
