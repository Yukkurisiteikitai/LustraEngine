/**
 * @jest-environment node
 */

import { POST } from '@/app/api/chat/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { createChatUseCase, createSaveChatMessageUseCase, createThreadUseCase } from '@/container/createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { createChatRateLimiter } from '@/infrastructure/rate-limiting/rateLimiterSingleton';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createChatUseCase: jest.fn(),
  createSaveChatMessageUseCase: jest.fn(),
  createThreadUseCase: jest.fn(),
}));

jest.mock('@/infrastructure/llm/createLLM', () => ({
  createLLM: jest.fn(),
}));

jest.mock('@/infrastructure/rate-limiting/rateLimiterSingleton', () => ({
  createChatRateLimiter: jest.fn(),
}));

jest.mock('@/infrastructure/llm/resolveStoredLlmConfig', () => ({
  resolveStoredLlmConfig: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockCreateChatUseCase = createChatUseCase as jest.Mock;
const mockCreateSaveChatMessageUseCase = createSaveChatMessageUseCase as jest.Mock;
const mockCreateThreadUseCase = createThreadUseCase as jest.Mock;
const mockCreateLLM = createLLM as jest.Mock;
const mockCreateChatRateLimiter = createChatRateLimiter as jest.Mock;
const mockResolveStoredLlmConfig = resolveStoredLlmConfig as jest.Mock;

describe('chat route history save', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not persist chat history when disabled in user settings', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateChatRateLimiter.mockReturnValue({
      check: jest.fn().mockResolvedValue({ allowed: true, usedTokens: 0, maxTokens: 1000, retryAfterSeconds: 0 }),
    });
    mockResolveStoredLlmConfig.mockResolvedValue({
      provider: 'openai',
      type: 'gpt',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
    });
    mockCreateLLM.mockReturnValue({});
    mockCreateChatUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        response: 'こんにちは',
        modelName: 'gpt-4.1',
        tokenUsage: { input: 10, output: 12, total: 22 },
      }),
    });
    mockCreateSaveChatMessageUseCase.mockReturnValue({
      execute: jest.fn(),
    });
    mockCreateThreadUseCase.mockReturnValue({
      execute: jest.fn(),
    });
    mockCreateRepositories.mockReturnValue({
      llmSettings: {},
      userSettings: {
        ensureDefaultByUser: jest.fn().mockResolvedValue({
          id: 'settings-1',
          userId: 'user-1',
          analysisEnabled: true,
          includeSensitiveEvidence: false,
          defaultEvidenceVisibility: 'private',
          allowChatFallbackDraft: true,
          allowSnapshotGeneration: true,
          allowChatHistorySave: false,
          requireConfirmationBeforeReanalysis: true,
          allowModelSnapshotGeneration: true,
          dataExportEnabled: true,
          dataDeletionRequestedAt: null,
          createdAt: '2026-05-14T00:00:00.000Z',
          updatedAt: '2026-05-14T00:00:00.000Z',
        }),
      },
    });

    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'hello',
          history: [],
          lmConfig: {
            provider: 'openai',
            type: 'gpt',
            model: 'gpt-4.1',
            baseUrl: 'https://api.openai.com/v1',
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { response: string; threadId?: string; pairNodeId?: string };
    expect(json.response).toBe('こんにちは');
    expect(json.threadId).toBeUndefined();
    expect(json.pairNodeId).toBeUndefined();
    expect(mockCreateThreadUseCase).not.toHaveBeenCalled();
    expect(mockCreateSaveChatMessageUseCase).not.toHaveBeenCalled();
  });
});
