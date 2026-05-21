import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';

export type ExperienceDispositionAction = 'soft_delete' | 'exclude';

export interface ManageExperienceDispositionResult {
  action: ExperienceDispositionAction;
  updatedCount: number;
  affectedHypothesisCount: number;
}

export class ManageExperienceDispositionUseCase {
  constructor(
    private readonly experienceRepo: IExperienceRepository,
    private readonly traitHypothesisRepo: ITraitHypothesisRepository,
  ) {}

  async execute(
    userId: string,
    experienceIds: string[],
    action: ExperienceDispositionAction,
  ): Promise<ManageExperienceDispositionResult> {
    if (experienceIds.length === 0) {
      return { action, updatedCount: 0, affectedHypothesisCount: 0 };
    }

    const affectedHypothesisStatus =
      action === 'soft_delete'
        ? 'stale_due_to_evidence_deletion'
        : 'needs_review';

    const updated =
      action === 'soft_delete'
        ? await this.experienceRepo.softDelete(userId, experienceIds)
        : await this.experienceRepo.exclude(userId, experienceIds);

    const updatedExperienceIds = updated.map((experience) => experience.id);
    const affectedHypothesisCount =
      updatedExperienceIds.length === 0
        ? 0
        : await this.traitHypothesisRepo.markStatusByEvidenceIds(
            userId,
            updatedExperienceIds,
            affectedHypothesisStatus,
          );

    return {
      action,
      updatedCount: updated.length,
      affectedHypothesisCount,
    };
  }
}
