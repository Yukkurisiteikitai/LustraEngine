import type { LMConfig } from '@/types';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { LMStudioAdapter } from './adapters/LMStudioAdapter';

export interface IStreamingLLMAdapter {
  generateStream(systemPrompt: string, userMessage: string, maxTokens: number): AsyncGenerator<string>;
}

export function createStreamingAdapter(config: LMConfig): IStreamingLLMAdapter {
  if (config.provider === 'claude') {
    return new ClaudeAdapter(config.claudeApiKey ?? '');
  }
  return new LMStudioAdapter(
    config.lmstudioEndpoint ?? 'http://localhost:1234',
    config.lmstudioApiKey ?? 'lm-studio',
    config.lmstudioModel ?? 'local-model',
  );
}
