import { InferTraitsUseCase } from '@/application/usecases/InferTraitsUseCase';
import { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';

describe('InferTraitsUseCase settings', () => {
  it('skips inference when analysis is disabled', async () => {
    const expRepo = {
      findRecent: jest.fn(),
    };
    const clusterQuery = {
      findByUser: jest.fn(),
    };
    const traitHypothesisRepo = {
      appendMany: jest.fn(),
      append: jest.fn(),
      findByUser: jest.fn(),
      findActiveByUser: jest.fn(),
      markRevised: jest.fn(),
    };
    const userSettingsRepo = {
      ensureDefaultByUser: jest.fn().mockResolvedValue({
        id: 'settings-1',
        userId: 'user-1',
        analysisEnabled: false,
        includeSensitiveEvidence: false,
        defaultEvidenceVisibility: 'analysis_allowed',
        allowChatFallbackDraft: true,
        allowSnapshotGeneration: true,
        allowChatHistorySave: false,
        requireConfirmationBeforeReanalysis: true,
        allowModelSnapshotGeneration: true,
        dataExportEnabled: true,
        dataDeletionRequestedAt: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
      }),
    };

    const useCase = new InferTraitsUseCase(
      expRepo as never,
      clusterQuery as never,
      traitHypothesisRepo as never,
      { generate: jest.fn() } as never,
      { warn: jest.fn(), error: jest.fn() } as never,
      { execute: jest.fn() } as never,
      new LLMResponseValidator(),
      userSettingsRepo as never,
    );

    const result = await useCase.execute('user-1');

    expect(result.summary.usedModel).toBe('analysis_disabled');
    expect(traitHypothesisRepo.appendMany).not.toHaveBeenCalled();
    expect(expRepo.findRecent).not.toHaveBeenCalled();
  });
});
