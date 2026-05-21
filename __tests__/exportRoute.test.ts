/**
 * @jest-environment node
 */

import { GET } from '@/app/api/export/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { createExportUserDataUseCase } from '@/container/createUseCases';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createExportUserDataUseCase: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockCreateExportUserDataUseCase = createExportUserDataUseCase as jest.Mock;

describe('/api/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      userSettings: {
        ensureDefaultByUser: jest.fn().mockResolvedValue({
          dataExportEnabled: true,
        }),
      },
    });
    mockCreateExportUserDataUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        generatedAt: '2026-05-15T00:00:00.000Z',
        userId: 'user-1',
        exportVersion: 1,
        settings: { dataExportEnabled: true },
        llmSettings: null,
        evidence: [],
        hypotheses: [],
        chat: { threads: [], pairNodes: [], messages: [] },
        snapshot: { enabled: true, data: null, summaryText: null },
      }),
    });
  });

  it('returns a JSON export when enabled', async () => {
    const response = await GET();
    const json = (await response.json()) as {
      generatedAt: string;
      exportVersion: number;
      snapshot: { enabled: boolean };
    };

    expect(response.status).toBe(200);
    expect(json.generatedAt).toBe('2026-05-15T00:00:00.000Z');
    expect(json.exportVersion).toBe(1);
    expect(json.snapshot.enabled).toBe(true);
  });

  it('blocks export when disabled', async () => {
    mockCreateRepositories.mockReturnValueOnce({
      userSettings: {
        ensureDefaultByUser: jest.fn().mockResolvedValue({
          dataExportEnabled: false,
        }),
      },
    });

    const response = await GET();
    const json = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(json.message).toContain('データエクスポート');
  });
});
