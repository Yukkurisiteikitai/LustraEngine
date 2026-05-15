import { AnalysisContextService } from '@/application/analysis/AnalysisContextService';

function makeQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

describe('AnalysisContextService V-004 regression', () => {
  it('reads active hypotheses and does not query traits as current truth', async () => {
    const experienceQuery = makeQuery({
      data: [
        {
          id: 'exp-1',
          description: '先延ばししてしまった',
          stress_level: 4,
          logged_at: '2026-05-14T00:00:00.000Z',
          domain_id: 'WORK',
          domains: { description: '仕事' },
        },
      ],
      error: null,
    });

    const episodeQuery = makeQuery({
      data: [],
      error: null,
    });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_settings') return makeQuery({ data: { analysis_enabled: true }, error: null });
        if (table === 'traits') {
          throw new Error('traits table should not be queried');
        }
        if (table === 'experiences') return experienceQuery;
        if (table === 'episode_clusters') return episodeQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const traitHypothesisRepo = {
      findActiveByUser: jest.fn().mockResolvedValue([
        {
          id: 'th-1',
          userId: 'user-1',
          traitKey: 'discipline',
          hypothesisLabel: 'low',
          hypothesisText: '現時点のログ上、自律性が低めという仮説があります。',
          score: 0.2,
          confidence: 0.8,
          uncertainty: 0.2,
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
    const experienceRepo = {} as never;

    const service = new AnalysisContextService(supabase as never, experienceRepo, traitHypothesisRepo as never);
    const context = await service.buildContext('user-1', 'quick');

    expect(traitHypothesisRepo.findActiveByUser).toHaveBeenCalledWith('user-1');
    expect(context.activeHypotheses).toHaveLength(1);
    expect(context.activeHypotheses?.[0].traitKey).toBe('discipline');
    expect(supabase.from).toHaveBeenCalledWith('user_settings');
    expect(supabase.from).toHaveBeenCalledWith('experiences');
    expect(experienceQuery.eq).toHaveBeenCalledWith('visibility', 'analysis_allowed');
    expect(experienceQuery.is).toHaveBeenCalledWith('soft_deleted_at', null);
  });
});
