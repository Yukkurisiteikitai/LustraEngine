/**
 * @jest-environment node
 */

import { GET } from '@/app/api/logs/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
let query: {
  select: jest.Mock;
  eq: jest.Mock;
  gte: jest.Mock;
  is: jest.Mock;
  order: jest.Mock;
};

describe('/api/logs GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'e-1',
            user_id: 'user-1',
            description: 'visible item',
            stress_level: 2,
            action_result: 'CONFRONTED',
            visibility: 'private',
            report_difficulty: 2,
            careful: false,
            logged_at: '2026-05-15',
            soft_deleted_at: null,
          },
        ],
        error: null,
      }),
    };
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: jest.fn(() => query),
    });
  });

  it('filters out soft deleted evidence in the normal list', async () => {
    const response = await GET();
    const json = (await response.json()) as { experiences: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(json.experiences).toHaveLength(1);
    expect(query.is).toHaveBeenCalledWith('soft_deleted_at', null);
    expect(mockCreateSupabaseServerClient).toHaveBeenCalled();
  });
});
