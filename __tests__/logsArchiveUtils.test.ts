import {
  AGE_BUCKET_LABELS,
  getAgeBucket,
  groupArchiveExperiences,
} from '@/app/logs/archiveUtils';

describe('archive utils', () => {
  it('assigns records to relative age buckets', () => {
    const now = new Date('2026-05-21T00:00:00.000Z');

    expect(getAgeBucket('2026-05-20', now)).toBe('7d');
    expect(getAgeBucket('2026-05-05', now)).toBe('30d');
    expect(getAgeBucket('2026-03-10', now)).toBe('90d');
    expect(getAgeBucket('2026-01-10', now)).toBe('180d');
    expect(getAgeBucket('2025-08-10', now)).toBe('365d');
    expect(getAgeBucket('2024-12-10', now)).toBe('older');
  });

  it('groups archive items in display order', () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const groups = groupArchiveExperiences(
      [
        {
          id: 'e-1',
          userId: 'user-1',
          description: 'older',
          stressLevel: 2,
          actionResult: 'CONFRONTED_SUCCESS',
          visibility: 'private',
          reportDifficulty: 2,
          careful: false,
          date: '2025-08-10',
        },
        {
          id: 'e-2',
          userId: 'user-1',
          description: 'recent',
          stressLevel: 4,
          actionResult: 'AVOIDED',
          visibility: 'private',
          reportDifficulty: 3,
          careful: false,
          date: '2026-05-20',
        },
      ],
      now,
    );

    expect(groups.map((group) => group.bucket)).toEqual(['7d', '365d']);
    expect(groups[0]?.items[0]?.description).toBe('recent');
    expect(groups[1]?.items[0]?.description).toBe('older');
    expect(AGE_BUCKET_LABELS[groups[0]?.bucket ?? '7d']).toBe('1週間以内');
  });
});
