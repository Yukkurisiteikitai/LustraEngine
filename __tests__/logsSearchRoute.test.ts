/**
 * @jest-environment node
 */

import { GET } from '@/app/api/logs/search/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;

describe('/api/logs/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'e-1',
            user_id: 'user-1',
            logged_at: '2026-05-20',
            description: '会議で緊張した',
            goal: '説明する',
            action: '話した',
            emotion: '不安',
            context: '午後の会議',
            trigger: null,
            outcome: null,
            emotion_level: 3,
            stress_level: 4,
            domain_id: null,
            tags: [],
            action_result: 'CONFRONTED',
            action_memo: null,
            source: 'manual',
            visibility: 'private',
            report_difficulty: 3,
            careful: false,
            processed_at: null,
            soft_deleted_at: null,
            created_at: '2026-05-20T00:00:00.000Z',
            domain_description: '仕事',
            matched_field: 'description',
            search_rank: 0.55,
          },
        ],
        error: null,
      }),
    });
  });

  it('searches a selected field on the server side', async () => {
    const response = await GET(
      new Request('https://example.test/api/logs/search?q=%E4%BC%9A%E8%AD%B0&field=description'),
    );
    const json = (await response.json()) as { items: Array<{ matchedField: string }> };

    expect(response.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.matchedField).toBe('description');
    expect(mockCreateSupabaseServerClient).toHaveBeenCalled();
  });
});
