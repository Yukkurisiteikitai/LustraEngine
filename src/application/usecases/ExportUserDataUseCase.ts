import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';
import type { IUserSettingsRepository } from '@/core/domains/user-settings/IUserSettingsRepository';
import type { IUserLlmSettingsRepository } from '@/core/domains/llm/IUserLlmSettingsRepository';
import type { IThreadRepository } from '@/core/domains/chat/IThreadRepository';
import type { IPairNodeRepository } from '@/core/domains/chat/IPairNodeRepository';
import type { IMessageRepository } from '@/core/domains/chat/IMessageRepository';
import {
  buildUserModelSnapshot,
  summarizeUserModelSnapshot,
} from '@/application/mappers/UserModelSnapshotMapper';
import type { UserModelSnapshot } from '@/types';

export interface ExportUserDataResult {
  generatedAt: string;
  userId: string;
  exportVersion: number;
  settings: unknown;
  llmSettings: unknown;
  evidence: Array<Record<string, unknown>>;
  hypotheses: Array<Record<string, unknown>>;
  chat: {
    threads: Array<Record<string, unknown>>;
    pairNodes: Array<Record<string, unknown>>;
    messages: Array<Record<string, unknown>>;
  };
  snapshot: {
    enabled: boolean;
    data: UserModelSnapshot | null;
    summaryText: string | null;
  };
}

function labelsForEvidence(record: { visibility: string; softDeletedAt?: string | null; careful: boolean; reportDifficulty: number }) {
  const labels = [record.visibility];
  if (record.softDeletedAt) labels.push('soft_deleted');
  if (record.careful) labels.push('careful');
  if (record.reportDifficulty >= 4) labels.push('sensitive');
  return labels;
}

export class ExportUserDataUseCase {
  constructor(
    private readonly experienceRepo: IExperienceRepository,
    private readonly traitHypothesisRepo: ITraitHypothesisRepository,
    private readonly userSettingsRepo: IUserSettingsRepository,
    private readonly llmSettingsRepo: IUserLlmSettingsRepository,
    private readonly threadRepo: IThreadRepository,
    private readonly pairNodeRepo: IPairNodeRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(userId: string): Promise<ExportUserDataResult> {
    const settings = await this.userSettingsRepo.ensureDefaultByUser(userId);
    const llmSettings = await this.llmSettingsRepo.getActiveByUser(userId);
    const evidence = await this.experienceRepo.findAllByUser(userId);
    const hypotheses = await this.traitHypothesisRepo.findAllByUser(userId);
    const threads = await this.threadRepo.findByUser(userId);
    const pairNodes = await Promise.all(threads.map((thread) => this.pairNodeRepo.findByThread(thread.id)));
    const messages = await this.messageRepo.findByPairNodes(pairNodes.flat().map((pairNode) => pairNode.id));

    const activeHypotheses = hypotheses.filter((h) => h.status === 'active');
    const snapshot = settings.allowSnapshotGeneration
      ? buildUserModelSnapshot(userId, activeHypotheses)
      : null;

    return {
      generatedAt: new Date().toISOString(),
      userId,
      exportVersion: 1,
      settings: { ...settings } as Record<string, unknown>,
      llmSettings: llmSettings ? ({ ...llmSettings } as Record<string, unknown>) : null,
      evidence: evidence.map((record) => ({
        ...record,
        labels: labelsForEvidence(record),
      })),
      hypotheses: hypotheses.map((record) => ({ ...record }) as Record<string, unknown>),
      chat: {
        threads: threads.map((record) => ({ ...record }) as Record<string, unknown>),
        pairNodes: pairNodes.flat().map((record) => ({ ...record }) as Record<string, unknown>),
        messages: messages.map((record) => ({ ...record }) as Record<string, unknown>),
      },
      snapshot: {
        enabled: settings.allowSnapshotGeneration,
        data: snapshot,
        summaryText: snapshot ? summarizeUserModelSnapshot(snapshot) : null,
      },
    };
  }
}
