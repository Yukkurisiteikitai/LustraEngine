import { ChatUseCase } from '@/application/usecases/ChatUseCase';

describe('ChatUseCase V-004 regression', () => {
  it('reads active hypotheses instead of persona snapshots', async () => {
    const expRepo = {
      findRecent: jest.fn().mockResolvedValue([]),
    };
    const traitHypothesisRepo = {
      findActiveByUser: jest.fn().mockResolvedValue([
        {
          id: 'th-1',
          userId: 'user-1',
          traitKey: 'social_anxiety',
          hypothesisLabel: 'high',
          hypothesisText: '現時点のログ上、社会不安が高めという仮説があります。',
          score: 0.8,
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
    const llm = {
      generate: jest.fn().mockResolvedValue({
        text: 'response',
        tokenUsage: { total: 10 },
        modelName: 'model-a',
      }),
    };

    const useCase = new ChatUseCase(expRepo as never, traitHypothesisRepo as never, llm as never);
    const result = await useCase.execute('user-1', 'hello', []);

    expect(traitHypothesisRepo.findActiveByUser).toHaveBeenCalledWith('user-1');
    expect(expRepo.findRecent).toHaveBeenCalledWith('user-1', 5, { visibility: 'analysis_allowed' });
    expect(llm.generate).toHaveBeenCalled();
    expect(result.fallback).toBeUndefined();
    expect(result.response).toBe('response');
  });

  it('falls back to evidence logging when active hypotheses are empty', async () => {
    const expRepo = { findRecent: jest.fn() };
    const traitHypothesisRepo = {
      findActiveByUser: jest.fn().mockResolvedValue([]),
    };
    const llm = { generate: jest.fn() };

    const useCase = new ChatUseCase(expRepo as never, traitHypothesisRepo as never, llm as never);
    const result = await useCase.execute('user-1', 'hello', []);

    expect(result.fallback?.mode).toBe('evidence_logging');
    expect(result.fallback?.reason).toBe('active_hypotheses_empty');
    expect(result.fallback?.questions).toHaveLength(3);
    expect(expRepo.findRecent).not.toHaveBeenCalled();
    expect(llm.generate).not.toHaveBeenCalled();
  });
});
