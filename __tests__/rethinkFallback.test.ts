/**
 * @jest-environment node
 */

import { POST } from '@/app/api/chat/rethink/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { createGetThreadHistoryUseCase } from '@/container/createUseCases';
import { createChatRateLimiter } from '@/infrastructure/rate-limiting/rateLimiterSingleton';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createGetThreadHistoryUseCase: jest.fn(),
  createRethinkMessageUseCase: jest.fn(),
}));

jest.mock('@/infrastructure/rate-limiting/rateLimiterSingleton', () => ({
  createChatRateLimiter: jest.fn(),
}));

jest.mock('@/infrastructure/llm/resolveStoredLlmConfig', () => ({
  resolveStoredLlmConfig: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockCreateGetThreadHistoryUseCase = createGetThreadHistoryUseCase as jest.Mock;
const mockCreateChatRateLimiter = createChatRateLimiter as jest.Mock;
const mockResolveStoredLlmConfig = resolveStoredLlmConfig as jest.Mock;

describe('rethink fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns evidence logging guidance when active hypotheses are empty', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateChatRateLimiter.mockReturnValue({
      check: jest.fn().mockResolvedValue({ allowed: true, usedTokens: 0, maxTokens: 1000, retryAfterSeconds: 0 }),
    });
    mockResolveStoredLlmConfig.mockResolvedValue({ provider: 'openai', model: 'gpt-4.1' });
    mockCreateGetThreadHistoryUseCase.mockReturnValue({
      getMessages: jest.fn().mockResolvedValue([
        {
          pairNodeId: 'pair-1',
          role: 'user',
          content: 'hello',
        },
      ]),
    });
    mockCreateRepositories.mockReturnValue({
      llmSettings: {},
      experience: {
        findRecent: jest.fn().mockResolvedValue([]),
      },
      psychology: {
        getBigFiveScore: jest.fn().mockResolvedValue(null),
        getAttachmentProfile: jest.fn().mockResolvedValue(null),
        getIdentityStatus: jest.fn().mockResolvedValue([]),
      },
      userSettings: {
        ensureDefaultByUser: jest.fn().mockResolvedValue({
          allowChatFallbackDraft: true,
        }),
      },
      traitHypothesis: {
        findActiveByUser: jest.fn().mockResolvedValue([]),
      },
    });

    const response = await POST(
      new Request('http://localhost/api/chat/rethink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pairNodeId: 'pair-1',
          newPrompt: '',
          threadId: 'thread-1',
          lmConfig: { provider: 'openai', model: 'gpt-4.1' },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      mode: string;
      reason: string;
      questions: string[];
    };
    expect(json.mode).toBe('evidence_logging');
    expect(json.reason).toBe('active_hypotheses_empty');
    expect(json.questions).toHaveLength(3);
  });
});
