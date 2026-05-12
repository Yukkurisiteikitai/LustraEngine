import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { LMConfig } from '@/types';
import { ConcurrentLLMAdapter } from './adapters/ConcurrentLLMAdapter';
import {
  createAnthropicClient,
  createOpenAICompatibleClient,
  createUnsupportedProviderClient,
  normalizeLLMConfig,
  toILLMPort,
} from './providerRegistry';

export function createLLM(
  config: LMConfig,
  opts?: { waitForSlot?: boolean; endpoint?: string },
): ILLMPort {
  const resolved = normalizeLLMConfig(config);

  const baseClient =
    resolved.provider === 'anthropic'
      ? createAnthropicClient(resolved)
      : resolved.provider === 'gemini'
        ? createUnsupportedProviderClient('gemini')
        : createOpenAICompatibleClient(resolved);

  const base: ILLMPort = toILLMPort(baseClient);

  return new ConcurrentLLMAdapter(base, {
    waitForSlot: opts?.waitForSlot ?? true,
    endpoint: opts?.endpoint,
  });
}
