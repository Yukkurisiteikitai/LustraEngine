import { SupabaseTraitHypothesisRepository } from '@/infrastructure/repositories/SupabaseTraitHypothesisRepository';

function makeHypothesisRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h-1',
    user_id: 'user-1',
    trait_key: 'introversion',
    hypothesis_label: 'high',
    hypothesis_text: '仮説',
    score: 0.7,
    confidence: 0.8,
    uncertainty: 0.2,
    evidence_ids: ['e-1'],
    source_pattern_ids: [],
    model_name: 'mock',
    model_version: '1',
    prompt_version: 'v004',
    status: 'active',
    supersedes_hypothesis_id: null,
    superseded_by_hypothesis_id: null,
    analysis_job_id: null,
    created_at: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('SupabaseTraitHypothesisRepository', () => {
  it('marks active hypotheses for any matching evidence id within the same user', async () => {
    const selectQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [
          makeHypothesisRow({ id: 'h-1', evidence_ids: ['e-1'] }),
          makeHypothesisRow({ id: 'h-2', evidence_ids: ['e-2', 'e-3'] }),
          makeHypothesisRow({ id: 'h-3', evidence_ids: ['e-9'] }),
        ],
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [{ id: 'h-1' }, { id: 'h-2' }],
        error: null,
      }),
    };
    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(selectQuery)
        .mockReturnValueOnce(updateQuery),
    };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const count = await repo.markStatusByEvidenceIds(
      'user-1',
      ['e-1', 'e-2'],
      'needs_review',
    );

    expect(count).toBe(2);
    expect(selectQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(selectQuery.eq).toHaveBeenCalledWith('status', 'active');
    expect(updateQuery.in).toHaveBeenCalledWith('id', ['h-1', 'h-2']);
    expect(updateQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(updateQuery.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('does not update when no active hypothesis references the evidence ids', async () => {
    const selectQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [makeHypothesisRow({ id: 'h-3', evidence_ids: ['e-9'] })],
        error: null,
      }),
    };
    const supabase = {
      from: jest.fn().mockReturnValue(selectQuery),
    };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const count = await repo.markStatusByEvidenceIds(
      'user-1',
      ['e-1', 'e-2'],
      'needs_review',
    );

    expect(count).toBe(0);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
