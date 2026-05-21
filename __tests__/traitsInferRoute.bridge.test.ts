/**
 * @jest-environment node
 */

import { POST } from '@/app/api/traits/infer/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { createInferTraitsUseCase } from '@/container/createUseCases';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import { createLLM } from '@/infrastructure/llm/createLLM';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createInferTraitsUseCase: jest.fn(),
}));

jest.mock('@/infrastructure/llm/resolveStoredLlmConfig', () => ({
  resolveStoredLlmConfig: jest.fn(),
}));

jest.mock('@/infrastructure/llm/createLLM', () => ({
  createLLM: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockCreateInferTraitsUseCase = createInferTraitsUseCase as jest.Mock;
const mockResolveStoredLlmConfig = resolveStoredLlmConfig as jest.Mock;
const mockCreateLLM = createLLM as jest.Mock;

describe('traits infer route bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls InferTraitsUseCase without the legacyCompatibility option', async () => {
    const execute = jest.fn().mockResolvedValue({
      hypotheses: [],
      summary: {
        generatedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        evidenceCount: 0,
        usedModel: 'gpt-4.1',
        usedPromptVersion: 'v004',
      },
    });

    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      llmSettings: {},
    });
    mockResolveStoredLlmConfig.mockResolvedValue({ provider: 'openai', model: 'gpt-4.1' });
    mockCreateLLM.mockReturnValue({} as never);
    mockCreateInferTraitsUseCase.mockReturnValue({ execute });

    const response = await POST(
      new Request('http://localhost/api/traits/infer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lmConfig: { provider: 'openai', model: 'gpt-4.1' },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith('user-1', undefined);

    const json = (await response.json()) as {
      hypotheses: unknown[];
      summary: unknown;
      legacyTraits?: unknown;
    };
    expect(json).not.toHaveProperty('legacyTraits');
    expect(json.hypotheses).toEqual([]);
    expect(json.summary).toBeDefined();
  });
});
