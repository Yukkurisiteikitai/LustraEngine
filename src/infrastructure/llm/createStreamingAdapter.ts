import type { LMConfig } from '@/types';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { LMStudioAdapter } from './adapters/LMStudioAdapter';
import { normalizeLLMConfig } from './providerRegistry';

export interface IStreamingLLMAdapter {
  generateStream(systemPrompt: string, userMessage: string, maxTokens: number): AsyncGenerator<string>;
}

export function createStreamingAdapter(config: LMConfig): IStreamingLLMAdapter {
  const resolved = normalizeLLMConfig(config);

  if (resolved.provider === 'anthropic') {
    return new ClaudeAdapter(resolved.apiKey, resolved.model, resolved.baseUrl);
  }

  if (resolved.provider === 'gemini') {
    throw new Error('Provider gemini is not implemented in worker runtime yet');
  }

  return new LMStudioAdapter(
    resolved.baseUrl ?? 'http://localhost:1234',
    resolved.apiKey || 'lm-studio',
    resolved.model || 'local-model',
  );
}
