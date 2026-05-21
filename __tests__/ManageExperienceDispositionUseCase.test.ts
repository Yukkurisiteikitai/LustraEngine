import { ManageExperienceDispositionUseCase } from '@/application/usecases/ManageExperienceDispositionUseCase';

describe('ManageExperienceDispositionUseCase', () => {
  it('marks soft deleted evidence hypotheses as stale', async () => {
    const experienceRepo = {
      softDelete: jest.fn().mockResolvedValue([{ id: 'e-1' }]),
      exclude: jest.fn(),
    };
    const traitHypothesisRepo = {
      markStatusByEvidenceIds: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new ManageExperienceDispositionUseCase(
      experienceRepo as never,
      traitHypothesisRepo as never,
    );

    const result = await useCase.execute('user-1', ['e-1'], 'soft_delete');

    expect(result).toEqual({
      action: 'soft_delete',
      updatedCount: 1,
      affectedHypothesisCount: 1,
    });
    expect(experienceRepo.softDelete).toHaveBeenCalledWith('user-1', ['e-1']);
    expect(traitHypothesisRepo.markStatusByEvidenceIds).toHaveBeenCalledWith(
      ['e-1'],
      'stale_due_to_evidence_deletion',
    );
  });

  it('marks excluded evidence hypotheses as needs_review', async () => {
    const experienceRepo = {
      softDelete: jest.fn(),
      exclude: jest.fn().mockResolvedValue([{ id: 'e-2' }]),
    };
    const traitHypothesisRepo = {
      markStatusByEvidenceIds: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new ManageExperienceDispositionUseCase(
      experienceRepo as never,
      traitHypothesisRepo as never,
    );

    const result = await useCase.execute('user-1', ['e-2'], 'exclude');

    expect(result).toEqual({
      action: 'exclude',
      updatedCount: 1,
      affectedHypothesisCount: 1,
    });
    expect(experienceRepo.exclude).toHaveBeenCalledWith('user-1', ['e-2']);
    expect(traitHypothesisRepo.markStatusByEvidenceIds).toHaveBeenCalledWith(
      ['e-2'],
      'needs_review',
    );
  });
});
