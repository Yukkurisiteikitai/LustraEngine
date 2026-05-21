import { DailyAnalysisScheduler } from '@/infrastructure/jobs/DailyAnalysisScheduler';

function makeExistingJobsQuery() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
}

function makeInsertJobQuery(jobId: string) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: jobId }, error: null }),
  };
}

describe('DailyAnalysisScheduler', () => {
  it('loads user settings in one query and skips disabled users', async () => {
    const experiencesQuery = {
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          { user_id: 'enabled-user' },
          { user_id: 'disabled-user' },
          { user_id: 'missing-settings-user' },
        ],
        error: null,
      }),
    };
    const settingsQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { user_id: 'enabled-user', analysis_enabled: true },
          { user_id: 'disabled-user', analysis_enabled: false },
        ],
        error: null,
      }),
    };
    const analysisJobQueries = [
      makeExistingJobsQuery(),
      makeInsertJobQuery('job-enabled'),
      makeExistingJobsQuery(),
      makeInsertJobQuery('job-missing-settings'),
    ];
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'experiences') return experiencesQuery;
        if (table === 'user_settings') return settingsQuery;
        if (table === 'analysis_jobs') return analysisJobQueries.shift();
        throw new Error(`unexpected table ${table}`);
      }),
    };
    const queueProducer = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const scheduler = new DailyAnalysisScheduler(supabase as never, queueProducer);
    const result = await scheduler.run();

    expect(result).toMatchObject({
      jobsCreated: 2,
      usersProcessed: 3,
      errors: [],
    });
    expect(settingsQuery.in).toHaveBeenCalledWith('user_id', [
      'enabled-user',
      'disabled-user',
      'missing-settings-user',
    ]);
    expect(queueProducer.enqueue).toHaveBeenCalledTimes(2);
    expect(queueProducer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-enabled', userId: 'enabled-user' }),
    );
    expect(queueProducer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-missing-settings',
        userId: 'missing-settings-user',
      }),
    );
  });
});
