import type { UserLlmSettings, UserLlmSettingsInput } from './LlmSettings';

export interface IUserLlmSettingsRepository {
  getActiveByUser(userId: string): Promise<UserLlmSettings | null>;
  upsertActive(userId: string, input: UserLlmSettingsInput, encryptedApiKey: string | null): Promise<UserLlmSettings>;
}
