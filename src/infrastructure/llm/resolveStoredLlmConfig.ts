import type { LMConfig } from '@/types';
import type { IUserLlmSettingsRepository } from '@/core/domains/llm/IUserLlmSettingsRepository';
import { ValidationError } from '@/core/errors/ValidationError';
import { validateLLMConfig } from './providerRegistry';
import { decryptApiKey, resolveLlmSettingsEncryptionKey } from './llmSettingsCrypto';

export async function resolveStoredLlmConfig(
  userId: string,
  config: LMConfig | null | undefined,
  repository: IUserLlmSettingsRepository,
  encryptionKey?: string,
) {
  const activeSetting = await repository.getActiveByUser(userId);
  if (!activeSetting || activeSetting.userId !== userId) {
    if (!config) throw new ValidationError('LLM設定が見つかりません。設定ページで設定してください。');
    return validateLLMConfig(config);
  }

  const storedApiKey = activeSetting.encryptedApiKey
    ? await decryptApiKey(activeSetting.encryptedApiKey, encryptionKey ?? resolveLlmSettingsEncryptionKey())
    : '';

  if (!storedApiKey) {
    if (activeSetting.hasApiKey) {
      throw new Error('Active LLM setting does not contain a readable API key');
    }
    // hasApiKey=false: no key stored (e.g. LM Studio), fall back to provided config
    if (!config) throw new ValidationError('LLM設定が見つかりません。設定ページで設定してください。');
    return validateLLMConfig(config);
  }

  const merged = {
    ...(config ?? {}),
    provider: activeSetting.provider,
    type: activeSetting.type,
    model: config?.model ?? activeSetting.model,
    baseUrl: config?.baseUrl ?? activeSetting.baseUrl ?? undefined,
    apiKey: storedApiKey,
  };

  return validateLLMConfig(merged);
}
