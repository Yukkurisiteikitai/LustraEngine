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
