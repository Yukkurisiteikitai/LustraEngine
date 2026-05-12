import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { LMConfig } from '@/types';
import type { IUserLlmSettingsRepository } from '@/core/domains/llm/IUserLlmSettingsRepository';
import { resolveStoredLlmConfig } from './resolveStoredLlmConfig';
import {
  createAnthropicClient,
  createOpenAICompatibleClient,
  createUnsupportedProviderClient,
  toILLMPort,
} from './providerRegistry';

export async function createWorkerLLM(
  env: CloudflareEnv,
  userId: string,
  llmSettingsRepository: IUserLlmSettingsRepository,
): Promise<ILLMPort> {
  const envConfig: LMConfig = {
    provider: (env.LLM_PROVIDER ?? 'custom_openai_compatible') as LMConfig['provider'],
    type: (env.LLM_TYPE ?? 'gpt') as LMConfig['type'],
    model: env.LLM_MODEL ?? 'gpt-4o-mini',
    apiKey: env.LLM_API_KEY ?? '',
    baseUrl: env.LLM_BASE_URL ?? 'http://localhost:1234/v1',
  };

  const config = await resolveStoredLlmConfig(
    userId,
    envConfig,
    llmSettingsRepository,
    env.LLM_SETTINGS_ENCRYPTION_KEY,
  );

  const client =
    config.provider === 'anthropic'
      ? createAnthropicClient(config)
      : config.provider === 'gemini'
        ? createUnsupportedProviderClient('gemini')
        : createOpenAICompatibleClient(config);

  return toILLMPort(client);
}