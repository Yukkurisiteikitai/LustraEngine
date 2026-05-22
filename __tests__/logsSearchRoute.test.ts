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
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
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

  it('falls back to ilike search when rpc is unavailable', async () => {
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'e-2',
              user_id: 'user-1',
              logged_at: '2026-05-19',
              description: '改造した',
              goal: '整理する',
              action: '話した',
              emotion: '不安',
              context: '会議の前に不安',
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
              created_at: '2026-05-19T00:00:00.000Z',
              domain_description: '仕事',
            },
          ],
          error: null,
        }),
      }),
    });

    const response = await GET(
      new Request('https://example.test/api/logs/search?q=%E6%94%B9%E9%80%A0&field=description'),
    );
    const json = (await response.json()) as { items: Array<{ experience: { id: string } }> };

    expect(response.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.experience.id).toBe('e-2');
  });

  it('returns a server error when rpc fails for an unexpected reason', async () => {
    const fromMock = jest.fn();
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }),
      from: fromMock,
    });

    const response = await GET(
      new Request('https://example.test/api/logs/search?q=%E6%94%B9%E9%80%A0&field=description'),
    );

    expect(response.status).toBe(500);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
