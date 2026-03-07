import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { LMConfig } from '@/types';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { LMStudioAdapter } from './adapters/LMStudioAdapter';

export function createLLM(config: LMConfig): ILLMPort {
  if (config.provider === 'claude') {
    return new ClaudeAdapter(config.claudeApiKey ?? '');
  }
  return new LMStudioAdapter(
    config.lmstudioEndpoint ?? 'http://localhost:1234',
    config.lmstudioApiKey ?? 'lm-studio',
    config.lmstudioModel ?? 'local-model',
  );
}
