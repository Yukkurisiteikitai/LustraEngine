/**
 * @jest-environment node
 */

import { GET } from '@/app/api/persona/route';
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

describe('persona route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a UserModelSnapshot summary instead of personaJson', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const traitHypothesis = {
      findActiveByUser: jest.fn().mockResolvedValue([
        {
          id: 'th-1',
          userId: 'user-1',
          traitKey: 'introversion',
          hypothesisLabel: 'high',
          hypothesisText: '現時点のログ上、内向性が高めという仮説があります。',
          score: 0.7,
          confidence: 0.9,
          uncertainty: 0.1,
          evidenceIds: ['exp-1'],
          sourcePatternIds: [],
          modelName: 'model-a',
          modelVersion: '1',
          promptVersion: 'v004',
          status: 'active',
          supersedesHypothesisId: null,
          supersededByHypothesisId: null,
          analysisJobId: null,
          createdAt: '2026-05-14T00:00:00.000Z',
        },
      ]),
    };
    mockCreateRepositories.mockReturnValue({
      traitHypothesis,
      psychology: {
        getBigFiveScore: jest.fn().mockResolvedValue(null),
        getAttachmentProfile: jest.fn().mockResolvedValue(null),
        getIdentityStatus: jest.fn().mockResolvedValue([]),
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const json = (await response.json()) as {
      snapshot: {
        snapshotKind: string;
        activeHypothesisCount: number;
        topHypotheses: Array<{ hypothesisText: string }>;
      };
      bigFive: null;
    };

    expect(json.snapshot.snapshotKind).toBe('hypothesis_summary');
    expect(json.snapshot.activeHypothesisCount).toBe(1);
    expect(json.snapshot.topHypotheses[0].hypothesisText).toContain('内向性');
    expect(json.snapshot).not.toHaveProperty('personaJson');
    expect(json.bigFive).toBeNull();
    expect(traitHypothesis.findActiveByUser).toHaveBeenCalledWith('user-1');
  });
});
