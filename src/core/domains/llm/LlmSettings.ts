import type { LLMProvider, LLMProviderType } from '@/types';

export interface UserLlmSettings {
  id: string;
  userId: string;
  provider: LLMProvider;
  type: LLMProviderType;
  model: string;
  baseUrl: string | null;
  encryptedApiKey: string | null;
  hasApiKey: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserLlmSettingsInput {
  provider: LLMProvider;
  type: LLMProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}
