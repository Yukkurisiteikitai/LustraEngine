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
    jest.resetAllMocks();
    mockResolveLlmSettingsEncryptionKey.mockReturnValue('fallback-secret');
    process.env.APP_ENV = 'development';
  });

  afterEach(() => {
    process.env.APP_ENV = originalEnv;
  });

  it('falls back to provided config when hasApiKey=false (e.g. LM Studio with no key stored)', async () => {
    const repository = {
      getActiveByUser: jest.fn().mockResolvedValue({
        userId: 'user-1',
        encryptedApiKey: null,
        hasApiKey: false,
        provider: 'custom_openai_compatible',
        type: 'gpt',
        model: 'local-model',
        baseUrl: 'http://localhost:1234/v1',
      }),
    };

    const resolved = await resolveStoredLlmConfig(
      'user-1',
      {
        provider: 'lmstudio',
        lmstudioEndpoint: 'http://localhost:1234/v1',
        lmstudioModel: 'local-model',
      } as never,
      repository as never,
    );

    expect(mockResolveLlmSettingsEncryptionKey).not.toHaveBeenCalled();
    expect(mockDecryptApiKey).not.toHaveBeenCalled();
    expect(resolved.provider).toBe('custom_openai_compatible');
    expect(resolved.apiKey).toBe('lm-studio');
  });

  it('does not resolve encryption key when encryptedApiKey is null (no-key provider in production)', async () => {
    const repository = {
      getActiveByUser: jest.fn().mockResolvedValue({
        userId: 'user-1',
        encryptedApiKey: null,
        hasApiKey: false,
        provider: 'custom_openai_compatible',
        type: 'gpt',
        model: 'local-model',
        baseUrl: 'http://localhost:1234/v1',
      }),
    };
    // Simulate production: resolveLlmSettingsEncryptionKey would throw if called without the env var
    mockResolveLlmSettingsEncryptionKey.mockImplementation(() => {
      throw new Error('LLM_SETTINGS_ENCRYPTION_KEY is missing');
    });

    await expect(
      resolveStoredLlmConfig(
        'user-1',
        {
          provider: 'lmstudio',
          lmstudioEndpoint: 'http://localhost:1234/v1',
          lmstudioModel: 'local-model',
        } as never,
        repository as never,
      ),
    ).resolves.toBeDefined();

    expect(mockResolveLlmSettingsEncryptionKey).not.toHaveBeenCalled();
  });

  it('throws ValidationError when no active setting exists and no config is provided', async () => {
    const repository = {
      getActiveByUser: jest.fn().mockResolvedValue(null),
    };

    await expect(
      resolveStoredLlmConfig('user-1', null, repository as never),
    ).rejects.toThrow('LLM設定が見つかりません。設定ページで設定してください。');

    expect(mockResolveLlmSettingsEncryptionKey).not.toHaveBeenCalled();
    expect(mockDecryptApiKey).not.toHaveBeenCalled();
  });

  it('throws when hasApiKey=true but storedApiKey is empty (decryption failure / key mismatch)', async () => {
    mockDecryptApiKey.mockResolvedValue('');
    const repository = {
      getActiveByUser: jest.fn().mockResolvedValue({
        userId: 'user-1',
        encryptedApiKey: 'corrupted-value',
        hasApiKey: true,
        provider: 'anthropic',
        type: 'claude',
        model: 'claude-haiku-4-5-20251001',
        baseUrl: 'https://api.anthropic.com/v1',
      }),
    };

    await expect(
      resolveStoredLlmConfig(
        'user-1',
        { provider: 'anthropic', apiKey: '' } as never,
        repository as never,
      ),
    ).rejects.toThrow('Active LLM setting does not contain a readable API key');
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
