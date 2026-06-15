/**
 * @jest-environment node
 */

import { POST } from '@/app/api/logs/extract/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { createExtractStructuredDiaryUseCase } from '@/container/createUseCases';
import { resolveStoredLlmConfig } from '@/infrastructure/llm/resolveStoredLlmConfig';
import { createLLM } from '@/infrastructure/llm/createLLM';
import { LLMExtractionFailedError } from '@/core/errors/LLMExtractionFailedError';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createExtractStructuredDiaryUseCase: jest.fn(),
}));

jest.mock('@/infrastructure/llm/resolveStoredLlmConfig', () => ({
  resolveStoredLlmConfig: jest.fn(),
}));

jest.mock('@/infrastructure/llm/createLLM', () => ({
  createLLM: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockCreateExtractStructuredDiaryUseCase = createExtractStructuredDiaryUseCase as jest.Mock;
const mockResolveStoredLlmConfig = resolveStoredLlmConfig as jest.Mock;
const mockCreateLLM = createLLM as jest.Mock;

const lmConfig = { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' };

const successResult = {
  description: '仕事でミスをした',
  context: '会議中に発言を間違えた',
  timeOfDay: 'AFTERNOON' as const,
  durationMinutes: 30,
  emotions: [{ label: '焦り', intensity: 4 as const }],
  actionResult: 'CONFRONTED_FAILED' as const,
  trigger: null,
  needsTriggerQuestion: true,
  triggerQuestion: 'そのミスのきっかけは何でしたか？',
  modelName: 'claude-sonnet-4-6',
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/logs/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/logs/extract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRepositories.mockReturnValue({ llmSettings: {} });
    mockResolveStoredLlmConfig.mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    mockCreateLLM.mockReturnValue({} as never);
  });

  function setupAuth(user: { id: string } | null) {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user } }),
      },
    });
  }

  it('returns 401 when unauthenticated', async () => {
    setupAuth(null);
    const response = await POST(makeRequest({ diaryText: '今日は疲れた', lmConfig }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when diaryText is empty', async () => {
    setupAuth({ id: 'user-1' });
    const response = await POST(makeRequest({ diaryText: '   ', lmConfig }));
    expect(response.status).toBe(400);
    const json = await response.json() as { message: string };
    expect(json.message).toMatch(/diaryText/);
  });

  it('returns 400 when lmConfig is missing', async () => {
    setupAuth({ id: 'user-1' });
    const response = await POST(makeRequest({ diaryText: '今日は疲れた' }));
    expect(response.status).toBe(400);
    const json = await response.json() as { message: string };
    expect(json.message).toMatch(/LLM/);
  });

  it('returns 200 with structured fields on success', async () => {
    setupAuth({ id: 'user-1' });
    mockCreateExtractStructuredDiaryUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue(successResult),
    });

    const response = await POST(makeRequest({ diaryText: '今日は仕事でミスをした', lmConfig }));
    expect(response.status).toBe(200);

    const json = await response.json() as typeof successResult;
    expect(json.description).toBe(successResult.description);
    expect(json.context).toBe(successResult.context);
    expect(json.timeOfDay).toBe(successResult.timeOfDay);
    expect(json.durationMinutes).toBe(successResult.durationMinutes);
    expect(json.emotions).toEqual(successResult.emotions);
    expect(json.actionResult).toBe(successResult.actionResult);
    expect(json.trigger).toBeNull();
    expect(json.needsTriggerQuestion).toBe(true);
    expect(json.triggerQuestion).toBe(successResult.triggerQuestion);
    expect(json.modelName).toBe(successResult.modelName);
  });

  it('returns 200 without rawText in response', async () => {
    setupAuth({ id: 'user-1' });
    mockCreateExtractStructuredDiaryUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ ...successResult, rawText: 'internal debug text' }),
    });

    const response = await POST(makeRequest({ diaryText: '今日は仕事でミスをした', lmConfig }));
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json).not.toHaveProperty('rawText');
  });

  it('returns 502 with LLM_EXTRACTION_FAILED when use case throws LLMExtractionFailedError', async () => {
    setupAuth({ id: 'user-1' });
    mockCreateExtractStructuredDiaryUseCase.mockReturnValue({
      execute: jest.fn().mockRejectedValue(new LLMExtractionFailedError('LLM returned invalid structure')),
    });

    const response = await POST(makeRequest({ diaryText: '今日は仕事でミスをした', lmConfig }));
    expect(response.status).toBe(502);
    const json = await response.json() as { code: string };
    expect(json.code).toBe('LLM_EXTRACTION_FAILED');
  });
});
