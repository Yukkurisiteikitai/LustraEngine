import { VerifyTraitHypothesisUseCase } from '@/application/usecases/VerifyTraitHypothesisUseCase';
import { ValidationError } from '@/core/errors/ValidationError';
import { LLMExtractionFailedError } from '@/core/errors/LLMExtractionFailedError';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';

function makeRecord(overrides: Partial<TraitHypothesisRecord> = {}): TraitHypothesisRecord {
  return {
    id: 'h-1',
    userId: 'user-1',
    traitKey: 'introversion',
    hypothesisLabel: 'high',
    hypothesisText: '内向的な傾向が見られる',
    score: 0.7,
    confidence: 0.8,
    uncertainty: 0.2,
    evidenceIds: ['e-1'],
    sourcePatternIds: [],
    modelName: 'mock',
    modelVersion: 'v1',
    promptVersion: 'v1',
    status: 'active',
    supersedesHypothesisId: null,
    supersededByHypothesisId: null,
    analysisJobId: null,
    source: 'model',
    revisedFromId: null,
    userCorrection: null,
    verifiedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findLiveByUser: jest.fn().mockResolvedValue([makeRecord()]),
    confirm: jest.fn().mockResolvedValue(makeRecord({ verifiedAt: '2026-07-01T00:00:00.000Z', source: 'user_confirm' })),
    hold: jest.fn().mockResolvedValue(makeRecord({ status: 'needs_review' })),
    reviseAtomic: jest.fn().mockResolvedValue(makeRecord({ id: 'h-new', source: 'user_revision' })),
    ...overrides,
  };
}

function makeLLM(text = '{"hypothesisText":"修正仮説","hypothesisLabel":"high","confidence":0.7,"uncertainty":0.3}') {
  return {
    generate: jest.fn().mockResolvedValue({ text, modelName: 'mock-model' }),
  };
}

function makeValidator(result: ReturnType<{ validateRevisionResponse: (s: string) => { hypothesisText: string; hypothesisLabel: string; confidence: number; uncertainty: number } | null }['validateRevisionResponse']> = {
  hypothesisText: '修正仮説', hypothesisLabel: 'high', confidence: 0.7, uncertainty: 0.3,
}) {
  return { validateRevisionResponse: jest.fn().mockReturnValue(result) };
}

const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
const retry = { execute: jest.fn().mockImplementation((fn: () => unknown) => fn()) };

describe('VerifyTraitHypothesisUseCase — confirm', () => {
  it('delegates to repo.confirm and returns the record', async () => {
    const repo = makeRepo();
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, makeLLM() as never, logger as never, retry as never, makeValidator() as never);

    const result = await useCase.confirm('user-1', 'h-1');

    expect(repo.confirm).toHaveBeenCalledWith('h-1', 'user-1');
    expect(result.source).toBe('user_confirm');
    expect(result.verifiedAt).not.toBeNull();
  });
});

describe('VerifyTraitHypothesisUseCase — hold', () => {
  it('delegates to repo.hold and returns the record', async () => {
    const repo = makeRepo();
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, makeLLM() as never, logger as never, retry as never, makeValidator() as never);

    const result = await useCase.hold('user-1', 'h-1');

    expect(repo.hold).toHaveBeenCalledWith('h-1', 'user-1');
    expect(result.status).toBe('needs_review');
  });
});

describe('VerifyTraitHypothesisUseCase — revise', () => {
  it('calls LLM, validates, then reviseAtomic with user_revision source', async () => {
    const repo = makeRepo();
    const llm = makeLLM();
    const validator = makeValidator();
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, llm as never, logger as never, retry as never, validator as never);

    const result = await useCase.revise('user-1', 'h-1', 'これが正しい');

    expect(llm.generate).toHaveBeenCalledTimes(1);
    expect(validator.validateRevisionResponse).toHaveBeenCalledTimes(1);
    expect(repo.reviseAtomic).toHaveBeenCalledWith(
      'h-1', 'user-1',
      expect.objectContaining({
        source: 'user_revision',
        userCorrection: 'これが正しい',
        modelVersion: 'mirror_v001',
      }),
    );
    expect(result.id).toBe('h-new');
  });

  it('throws ValidationError when hypothesis id is not in live list', async () => {
    const repo = makeRepo({ findLiveByUser: jest.fn().mockResolvedValue([makeRecord({ id: 'h-other' })]) });
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, makeLLM() as never, logger as never, retry as never, makeValidator() as never);

    await expect(useCase.revise('user-1', 'h-1', '訂正')).rejects.toThrow(ValidationError);
    expect(repo.reviseAtomic).not.toHaveBeenCalled();
  });

  it('retries once then throws LLMExtractionFailedError when validator always returns null', async () => {
    const repo = makeRepo();
    const llm = makeLLM('invalid json output');
    const validator = makeValidator(null);
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, llm as never, logger as never, retry as never, validator as never);

    await expect(useCase.revise('user-1', 'h-1', '訂正')).rejects.toThrow(LLMExtractionFailedError);
    expect(llm.generate).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(repo.reviseAtomic).not.toHaveBeenCalled();
  });

  it('succeeds on second attempt when first validation fails', async () => {
    const repo = makeRepo();
    const llm = { generate: jest.fn().mockResolvedValue({ text: '{}', modelName: 'mock' }) };
    const validated = { hypothesisText: '修正仮説', hypothesisLabel: 'high', confidence: 0.7, uncertainty: 0.3 };
    const validator = { validateRevisionResponse: jest.fn().mockReturnValueOnce(null).mockReturnValueOnce(validated) };
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, llm as never, logger as never, retry as never, validator as never);

    await useCase.revise('user-1', 'h-1', '訂正');

    expect(llm.generate).toHaveBeenCalledTimes(2);
    expect(repo.reviseAtomic).toHaveBeenCalledTimes(1);
  });

  it('propagates LLM errors without swallowing', async () => {
    const repo = makeRepo();
    const llm = { generate: jest.fn().mockRejectedValue(new Error('LLM connection failed')) };
    const useCase = new VerifyTraitHypothesisUseCase(repo as never, llm as never, logger as never, retry as never, makeValidator() as never);

    await expect(useCase.revise('user-1', 'h-1', '訂正')).rejects.toThrow('LLM connection failed');
    expect(repo.reviseAtomic).not.toHaveBeenCalled();
  });
});
