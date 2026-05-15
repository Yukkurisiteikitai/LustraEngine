import { InferTraitsUseCase } from '@/application/usecases/InferTraitsUseCase';
import { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';

describe('InferTraitsUseCase V-004 regression', () => {
  it('does not keep the old upsert-first flow as the primary output path', async () => {
    const expRepo = {
      findRecent: jest.fn().mockResolvedValue([
        {
          id: 'exp-1',
          userId: 'user-1',
          description: '会議で発言できなかった',
          stressLevel: 4,
          actionResult: 'AVOIDED',
          visibility: 'analysis_allowed',
          date: '2026-05-14',
        },
      ]),
    };
    const clusterQuery = {
      findByUser: jest.fn().mockResolvedValue([]),
    };
    const traitHypothesisRepo = {
      appendMany: jest.fn().mockResolvedValue(undefined),
      append: jest.fn(),
      findByUser: jest.fn(),
      findActiveByUser: jest.fn(),
      markRevised: jest.fn(),
    };
    const llm = {
      generate: jest.fn().mockResolvedValue({ text: '{"bigFive":{"openness":0.8,"conscientiousness":0.7,"extraversion":0.4,"agreeableness":0.6,"neuroticism":0.2,"confidence":0.9}}' }),
    };
    const logger = {
      warn: jest.fn(),
    };
    const retry = {
      execute: jest.fn((fn: () => Promise<{ text: string }>) => fn()),
    };
    const validator = new LLMResponseValidator();
    jest.spyOn(validator, 'validateBigFiveResponse').mockReturnValue({
      bigFive: {
        openness: 0.8,
        conscientiousness: 0.7,
        extraversion: 0.4,
        agreeableness: 0.6,
        neuroticism: 0.2,
        confidence: 0.9,
      },
      facets: [],
      attachmentHints: null,
      identityStatus: [],
    });
    jest.spyOn(validator, 'validateTraitResponse').mockReturnValue(null);

    const useCase = new InferTraitsUseCase(
      expRepo as never,
      clusterQuery as never,
      traitHypothesisRepo as never,
      llm as never,
      logger as never,
      retry as never,
      validator,
    );

    await useCase.execute('user-1', undefined, { strict: true });

    expect(expRepo.findRecent).toHaveBeenCalledWith('user-1', 20, { visibility: 'analysis_allowed' });
    expect(traitHypothesisRepo.appendMany).toHaveBeenCalledTimes(1);
    expect(traitHypothesisRepo.appendMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'user-1',
          status: 'active',
          confidence: 0.9,
        }),
      ]),
    );
  });
});
