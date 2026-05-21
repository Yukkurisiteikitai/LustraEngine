import { ManageExperienceDispositionUseCase } from '@/application/usecases/ManageExperienceDispositionUseCase';

describe('ManageExperienceDispositionUseCase', () => {
  it('marks soft deleted evidence hypotheses as stale', async () => {
    const experienceRepo = {
      softDelete: jest.fn().mockResolvedValue([{ id: 'e-1' }]),
      exclude: jest.fn(),
    };
    const traitHypothesisRepo = {
      markStatusByEvidenceIds: jest.fn().mockResolvedValue(2),
    };

    const useCase = new ManageExperienceDispositionUseCase(
      experienceRepo as never,
      traitHypothesisRepo as never,
    );

    const result = await useCase.execute('user-1', ['e-1'], 'soft_delete');

    expect(result).toEqual({
      action: 'soft_delete',
      updatedCount: 1,
      affectedHypothesisCount: 2,
    });
    expect(experienceRepo.softDelete).toHaveBeenCalledWith('user-1', ['e-1']);
    expect(traitHypothesisRepo.markStatusByEvidenceIds).toHaveBeenCalledWith(
      'user-1',
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
      markStatusByEvidenceIds: jest.fn().mockResolvedValue(1),
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
      'user-1',
      ['e-2'],
      'needs_review',
    );
  });

  it('only marks hypotheses for evidence rows that were actually updated', async () => {
    const experienceRepo = {
      softDelete: jest.fn().mockResolvedValue([{ id: 'owned-evidence' }]),
      exclude: jest.fn(),
    };
    const traitHypothesisRepo = {
      markStatusByEvidenceIds: jest.fn().mockResolvedValue(1),
    };

    const useCase = new ManageExperienceDispositionUseCase(
      experienceRepo as never,
      traitHypothesisRepo as never,
    );

    const result = await useCase.execute(
      'user-1',
      ['owned-evidence', 'missing-or-unowned'],
      'soft_delete',
    );

    expect(result).toEqual({
      action: 'soft_delete',
      updatedCount: 1,
      affectedHypothesisCount: 1,
    });
    expect(traitHypothesisRepo.markStatusByEvidenceIds).toHaveBeenCalledWith(
      'user-1',
      ['owned-evidence'],
      'stale_due_to_evidence_deletion',
    );
  });

  it('does not mark hypotheses when no requested evidence rows were updated', async () => {
    const experienceRepo = {
      softDelete: jest.fn().mockResolvedValue([]),
      exclude: jest.fn(),
    };
    const traitHypothesisRepo = {
      markStatusByEvidenceIds: jest.fn(),
    };

    const useCase = new ManageExperienceDispositionUseCase(
      experienceRepo as never,
      traitHypothesisRepo as never,
    );

    const result = await useCase.execute('user-1', ['unowned'], 'soft_delete');

    expect(result).toEqual({
      action: 'soft_delete',
      updatedCount: 0,
      affectedHypothesisCount: 0,
    });
    expect(traitHypothesisRepo.markStatusByEvidenceIds).not.toHaveBeenCalled();
  });
});
