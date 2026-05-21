import { ExportUserDataUseCase } from '@/application/usecases/ExportUserDataUseCase';
import { buildFallbackUserSettings } from '@/core/domains/user-settings/UserSettings';

describe('ExportUserDataUseCase', () => {
  it('labels sensitive and soft deleted evidence and includes a model snapshot', async () => {
    const experienceRepo = {
      findAllByUser: jest.fn().mockResolvedValue([
        {
          id: 'e-1',
          userId: 'user-1',
          description: '締切前に焦った',
          stressLevel: 5,
          actionResult: 'AVOIDED',
          source: 'manual',
          visibility: 'private',
          reportDifficulty: 4,
          careful: true,
          date: '2026-05-15',
          softDeletedAt: '2026-05-15T01:00:00.000Z',
        },
        {
          id: 'e-2',
          userId: 'user-1',
          description: '記録は残すが推論には使わない',
          stressLevel: 2,
          actionResult: 'CONFRONTED',
          source: 'manual',
          visibility: 'excluded',
          reportDifficulty: 2,
          careful: false,
          date: '2026-05-15',
          softDeletedAt: null,
        },
      ]),
    };
    const traitHypothesisRepo = {
      findByUser: jest.fn().mockResolvedValue([
        {
          id: 'h-1',
          userId: 'user-1',
          traitKey: 'introversion',
          hypothesisLabel: '内向性',
          hypothesisText: '会議で発言前に慎重になる傾向',
          score: 0.7,
          confidence: 0.8,
          uncertainty: 0.2,
          evidenceIds: ['e-1'],
          sourcePatternIds: [],
          modelName: 'mock',
          modelVersion: '1',
          promptVersion: '1',
          status: 'active',
          supersedesHypothesisId: null,
          supersededByHypothesisId: null,
          analysisJobId: null,
          createdAt: '2026-05-15T01:00:00.000Z',
        },
      ]),
    };
    const userSettingsRepo = {
      ensureDefaultByUser: jest.fn().mockResolvedValue(buildFallbackUserSettings('user-1')),
    };
    const llmSettingsRepo = {
      getActiveByUser: jest.fn().mockResolvedValue(null),
    };
    const threadRepo = {
      findByUser: jest.fn().mockResolvedValue([]),
    };
    const pairNodeRepo = {
      findByThread: jest.fn().mockResolvedValue([]),
    };
    const messageRepo = {
      findByPairNodes: jest.fn().mockResolvedValue([]),
    };

    const useCase = new ExportUserDataUseCase(
      experienceRepo as never,
      traitHypothesisRepo as never,
      userSettingsRepo as never,
      llmSettingsRepo as never,
      threadRepo as never,
      pairNodeRepo as never,
      messageRepo as never,
    );

    const exportData = await useCase.execute('user-1');

    expect(exportData.userId).toBe('user-1');
    expect(exportData.evidence).toHaveLength(2);
    expect(exportData.evidence[0].labels).toEqual(
      expect.arrayContaining(['private', 'careful', 'sensitive', 'soft_deleted']),
    );
    expect(exportData.evidence[1].labels).toEqual(expect.arrayContaining(['excluded']));
    expect(exportData.snapshot.enabled).toBe(true);
    expect(exportData.snapshot.data?.snapshotKind).toBe('hypothesis_summary');
    expect(exportData.snapshot.summaryText).toContain('現在の仮説は 1 件あります');
    expect(exportData.snapshot.summaryText).toContain('会議で発言前に慎重になる傾向');
  });
});
