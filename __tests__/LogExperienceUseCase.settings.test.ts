import { LogExperienceUseCase } from '@/application/usecases/LogExperienceUseCase';

describe('LogExperienceUseCase settings', () => {
  it('applies default evidence visibility from user settings when saving logs', async () => {
    const expRepo = {
      save: jest.fn().mockResolvedValue([
        { id: 'exp-1', visibility: 'private' },
      ]),
    };
    const userRepo = {
      ensureProfile: jest.fn().mockResolvedValue(undefined),
      ensureDefaultDomains: jest.fn().mockResolvedValue(new Map([['WORK', 'domain-1']])),
    };
    const userSettingsRepo = {
      ensureDefaultByUser: jest.fn().mockResolvedValue({
        id: 'settings-1',
        userId: 'user-1',
        analysisEnabled: true,
        includeSensitiveEvidence: false,
        defaultEvidenceVisibility: 'private',
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

    const useCase = new LogExperienceUseCase(expRepo as never, userRepo as never, userSettingsRepo as never);
    const result = await useCase.execute(
      'user-1',
      { displayName: 'Yuuto' },
      [
        {
          description: '会議で発言できなかった',
          stressLevel: 4,
          domain: 'WORK',
          actionResult: 'AVOIDED',
        },
      ],
      '2026-05-15',
    );

    expect(userSettingsRepo.ensureDefaultByUser).toHaveBeenCalledWith('user-1');
    expect(expRepo.save).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({ visibility: 'private' }),
      ]),
      '2026-05-15',
      expect.any(Map),
    );
    expect(result.savedIds).toEqual(['exp-1']);
  });

  it('forces private/careful when reportDifficulty is high', async () => {
    const expRepo = {
      save: jest.fn().mockResolvedValue([
        { id: 'exp-2', visibility: 'private', careful: true },
      ]),
    };
    const userRepo = {
      ensureProfile: jest.fn().mockResolvedValue(undefined),
      ensureDefaultDomains: jest.fn().mockResolvedValue(new Map([['WORK', 'domain-1']])),
    };
    const userSettingsRepo = {
      ensureDefaultByUser: jest.fn().mockResolvedValue({
        id: 'settings-1',
        userId: 'user-1',
        analysisEnabled: true,
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

    const useCase = new LogExperienceUseCase(expRepo as never, userRepo as never, userSettingsRepo as never);
    await useCase.execute(
      'user-1',
      { displayName: 'Yuuto' },
      [
        {
          description: '機密性の高い相談',
          stressLevel: 5,
          domain: 'WORK',
          actionResult: 'AVOIDED',
          reportDifficulty: 4,
          visibility: 'analysis_allowed',
        },
      ],
      '2026-05-15',
    );

    expect(expRepo.save).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          visibility: 'private',
          careful: true,
          reportDifficulty: 4,
        }),
      ]),
      '2026-05-15',
      expect.any(Map),
    );
  });
});
