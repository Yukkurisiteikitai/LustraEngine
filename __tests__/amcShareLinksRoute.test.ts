/**
 * @jest-environment node
 */

import { POST } from '@/app/api/amc/share-links/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/infrastructure/supabase/createAdminClient', () => ({
  createAdminClient: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;

describe('/api/amc/share-links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateAdminClient.mockReturnValue({});
  });

  it('rejects private share-link scopes before hitting the database', async () => {
    const response = await POST(
      new Request('http://localhost/api/amc/share-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recordId: 'record-1',
          accessScope: 'private',
          idempotencyKey: 'idem-1',
        }),
      }),
    );

    const json = (await response.json()) as { message: string };

    expect(response.status).toBe(400);
    expect(json.message).toBe('accessScopeの値が不正です');
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });
});
