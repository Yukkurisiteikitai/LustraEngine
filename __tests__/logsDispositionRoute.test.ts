/**
 * @jest-environment node
 */

import { PATCH } from '@/app/api/logs/[experienceId]/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createManageExperienceDispositionUseCase } from '@/container/createUseCases';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createUseCases', () => ({
  createManageExperienceDispositionUseCase: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateManageExperienceDispositionUseCase =
  createManageExperienceDispositionUseCase as jest.Mock;

describe('/api/logs/[experienceId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateManageExperienceDispositionUseCase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        action: 'soft_delete',
        updatedCount: 1,
        affectedHypothesisCount: 1,
      }),
    });
  });

  it('soft deletes evidence and marks linked hypotheses stale', async () => {
    const response = await PATCH(
      new Request('https://example.test/api/logs/e-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'soft_delete' }),
      }),
      { params: Promise.resolve({ experienceId: 'e-1' }) },
    );
    const json = (await response.json()) as { action: string };

    expect(response.status).toBe(200);
    expect(json.action).toBe('soft_delete');
    expect(mockCreateManageExperienceDispositionUseCase).toHaveBeenCalled();
  });
});
