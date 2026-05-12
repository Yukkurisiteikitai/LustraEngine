import type { LMConfig } from '@/types';
import type { IUserLlmSettingsRepository } from '@/core/domains/llm/IUserLlmSettingsRepository';
import { validateLLMConfig } from './providerRegistry';
import { decryptApiKey } from './llmSettingsCrypto';

export async function resolveStoredLlmConfig(
  userId: string,
  config: LMConfig,
  repository: IUserLlmSettingsRepository,
  encryptionKey?: string,
) {
  // In production, always use environment-default LLM config.
  // User-managed LLM settings are disabled in production for security.
  const appEnv = process.env.APP_ENV;
  if (appEnv === 'production') {
    return validateLLMConfig(config);
  }

  // Development/preview environments: allow user-stored LLM settings.
  const activeSetting = await repository.getActiveByUser(userId);
  if (!activeSetting || activeSetting.userId !== userId) {
    return validateLLMConfig(config);
  }

  if (!encryptionKey) {
    throw new Error('LLM settings encryption key is missing');
  }

  const storedApiKey = activeSetting.encryptedApiKey
    ? await decryptApiKey(activeSetting.encryptedApiKey, encryptionKey)
    : '';

  if (!storedApiKey) {
    throw new Error('Active LLM setting does not contain a readable API key');
  }

  const merged = {
    ...config,
    provider: activeSetting.provider,
    type: activeSetting.type,
    model: config.model ?? activeSetting.model,
    baseUrl: config.baseUrl ?? activeSetting.baseUrl ?? undefined,
    apiKey: storedApiKey,
  };

  return validateLLMConfig(merged);
}
