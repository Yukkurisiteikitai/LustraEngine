import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import { decryptApiKey, resolveLlmSettingsEncryptionKey } from '@/infrastructure/llm/llmSettingsCrypto';

jest.mock('@/infrastructure/llm/llmSettingsCrypto', () => ({
  decryptApiKey: jest.fn(),
  resolveLlmSettingsEncryptionKey: jest.fn(() => 'fallback-secret'),
}));

const mockDecryptApiKey = decryptApiKey as jest.Mock;
const mockResolveLlmSettingsEncryptionKey = resolveLlmSettingsEncryptionKey as jest.Mock;

describe('resolveStoredLlmConfig', () => {
  const originalEnv = process.env.APP_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = 'development';
  });

  afterEach(() => {
    process.env.APP_ENV = originalEnv;
  });

  it('falls back to a local secret when no encryption key is configured in development', async () => {
    mockDecryptApiKey.mockResolvedValue('stored-api-key');
    const repository = {
      getActiveByUser: jest.fn().mockResolvedValue({
        userId: 'user-1',
        encryptedApiKey: 'encrypted-value',
        provider: 'anthropic',
        type: 'claude',
        model: 'claude-haiku-4-5-20251001',
        baseUrl: 'https://api.anthropic.com/v1',
      }),
    };

    const resolved = await resolveStoredLlmConfig(
      'user-1',
      {
        provider: 'anthropic',
        type: 'claude',
        model: 'claude-haiku-4-5-20251001',
        apiKey: '',
      } as never,
      repository as never,
      undefined,
    );

    expect(mockResolveLlmSettingsEncryptionKey).toHaveBeenCalled();
    expect(mockDecryptApiKey).toHaveBeenCalledWith('encrypted-value', 'fallback-secret');
    expect(resolved.apiKey).toBe('stored-api-key');
  });
});
