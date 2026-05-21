import { GetAnalyticsUseCase } from '@/application/usecases/GetAnalyticsUseCase';

describe('GetAnalyticsUseCase', () => {
  it('uses only analysis_allowed evidence for recent analytics and streak dates', async () => {
    const expRepo = {
      findSince: jest.fn().mockResolvedValue([]),
      findAllDates: jest.fn().mockResolvedValue([]),
    };
    const useCase = new GetAnalyticsUseCase(expRepo as never);

    await useCase.execute('user-1');

    expect(expRepo.findSince).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      { visibility: 'analysis_allowed' },
    );
    expect(expRepo.findAllDates).toHaveBeenCalledWith(
      'user-1',
      { visibility: 'analysis_allowed' },
    );
  });
});
