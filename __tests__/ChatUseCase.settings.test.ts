import { ChatUseCase } from '@/application/usecases/ChatUseCase';

describe('ChatUseCase settings', () => {
  it('omits evidence draft template when chat fallback drafts are disabled', async () => {
    const expRepo = { findRecent: jest.fn() };
    const traitHypothesisRepo = {
      findActiveByUser: jest.fn().mockResolvedValue([]),
    };
    const llm = { generate: jest.fn() };
    const userSettingsRepo = {
      ensureDefaultByUser: jest.fn().mockResolvedValue({
        id: 'settings-1',
        userId: 'user-1',
        analysisEnabled: true,
        includeSensitiveEvidence: false,
        defaultEvidenceVisibility: 'analysis_allowed',
        allowChatFallbackDraft: false,
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

    const useCase = new ChatUseCase(
      expRepo as never,
      traitHypothesisRepo as never,
      llm as never,
      null,
      userSettingsRepo as never,
    );

    const result = await useCase.execute('user-1', 'hello', []);

    expect(result.fallback?.mode).toBe('evidence_logging');
    expect(result.fallback?.suggestedTemplate).toBe('');
    expect(userSettingsRepo.ensureDefaultByUser).toHaveBeenCalledWith('user-1');
    expect(llm.generate).not.toHaveBeenCalled();
  });
});
