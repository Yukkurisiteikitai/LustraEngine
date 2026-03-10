import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { LMConfig } from '@/types';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { LMStudioAdapter } from './adapters/LMStudioAdapter';
import { ConcurrentLLMAdapter } from './adapters/ConcurrentLLMAdapter';

export function createLLM(
  config: LMConfig,
  opts?: { waitForSlot?: boolean; endpoint?: string },
): ILLMPort {
  const base: ILLMPort =
    config.provider === 'claude'
      ? new ClaudeAdapter(config.claudeApiKey ?? '')
      : new LMStudioAdapter(
          config.lmstudioEndpoint ?? 'http://localhost:1234',
          config.lmstudioApiKey ?? 'lm-studio',
          config.lmstudioModel ?? 'local-model',
        );

  return new ConcurrentLLMAdapter(base, {
    waitForSlot: opts?.waitForSlot ?? true,
    endpoint: opts?.endpoint,
  });
}
