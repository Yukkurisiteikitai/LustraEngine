import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream } from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
let POST: typeof import('@/app/api/settings/llm/route').POST;

describe('settings llm route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_SETTINGS_ENCRYPTION_KEY;
    process.env.APP_ENV = 'development';
    Object.assign(globalThis, {
      TextEncoder,
      TextDecoder,
      ReadableStream,
      MessageChannel,
      MessagePort,
    });
    const { Headers, Request, Response } = require('undici');
    Object.assign(globalThis, { Request, Response, Headers });

    jest.isolateModules(() => {
      ({ POST } = require('@/app/api/settings/llm/route'));
    });
  });

  it('can save a local LM Studio config without requiring an encryption key', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const upsertActive = jest.fn().mockResolvedValue({
      provider: 'lmstudio',
      type: 'gpt',
      model: 'local-model',
      baseUrl: 'http://localhost:1234/v1',
      hasApiKey: true,
      isActive: true,
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
    });
    mockCreateRepositories.mockReturnValue({
      llmSettings: {
        getActiveByUser: jest.fn().mockResolvedValue(null),
        upsertActive,
      },
    });

    const response = await POST(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'lmstudio',
          type: 'gpt',
          model: 'local-model',
          lmstudioEndpoint: 'http://localhost:1234/v1',
          lmstudioModel: 'local-model',
        }),
        json: async () => ({
          provider: 'lmstudio',
          type: 'gpt',
          model: 'local-model',
          lmstudioEndpoint: 'http://localhost:1234/v1',
          lmstudioModel: 'local-model',
        }),
      } as never,
    );

    expect(response.status).toBe(200);
    expect(upsertActive).toHaveBeenCalled();
    const json = (await response.json()) as { setting: { provider: string; model: string } };
    expect(json.setting.provider).toBe('lmstudio');
    expect(json.setting.model).toBe('local-model');
  });
});
