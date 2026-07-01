import { SupabaseTraitHypothesisRepository } from '@/infrastructure/repositories/SupabaseTraitHypothesisRepository';

function makeHypothesisRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h-1',
    user_id: 'user-1',
    trait_key: 'introversion',
    hypothesis_label: 'high',
    hypothesis_text: '仮説テキスト',
    score: 0.7,
    confidence: 0.8,
    uncertainty: 0.2,
    evidence_ids: ['e-1'],
    source_pattern_ids: [],
    model_name: 'mock',
    model_version: '1',
    prompt_version: 'v001',
    status: 'active',
    supersedes_hypothesis_id: null,
    superseded_by_hypothesis_id: null,
    analysis_job_id: null,
    source: 'model',
    revised_from_id: null,
    user_correction: null,
    verified_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SupabaseTraitHypothesisRepository — findLiveByUser', () => {
  it('excludes dead statuses and deduplicates by trait_key keeping most recent', async () => {
    const rows = [
      makeHypothesisRow({ id: 'h-1', trait_key: 'introversion', status: 'active', created_at: '2026-06-02T00:00:00.000Z' }),
      makeHypothesisRow({ id: 'h-2', trait_key: 'introversion', status: 'needs_review', created_at: '2026-06-01T00:00:00.000Z' }),
      makeHypothesisRow({ id: 'h-3', trait_key: 'discipline', status: 'active', created_at: '2026-06-01T00:00:00.000Z' }),
    ];

    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: jest.fn().mockReturnValue(query) };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const result = await repo.findLiveByUser('user-1');

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.traitKey === 'introversion')?.id).toBe('h-1');
    expect(result.find((r) => r.traitKey === 'discipline')?.id).toBe('h-3');
    expect(query.not).toHaveBeenCalledWith('status', 'in', expect.stringContaining('revised'));
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('throws InfrastructureError when Supabase returns an error', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    const supabase = { from: jest.fn().mockReturnValue(query) };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    await expect(repo.findLiveByUser('user-1')).rejects.toThrow('traitHypothesis:findLiveByUser failed');
  });
});

describe('SupabaseTraitHypothesisRepository — findHistoryByTraitKey', () => {
  it('filters by user_id and trait_key', async () => {
    const rows = [
      makeHypothesisRow({ id: 'h-1', trait_key: 'discipline', status: 'revised' }),
      makeHypothesisRow({ id: 'h-2', trait_key: 'discipline', status: 'active' }),
    ];

    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const supabase = { from: jest.fn().mockReturnValue(query) };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const result = await repo.findHistoryByTraitKey('user-1', 'discipline');

    expect(result).toHaveLength(2);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('trait_key', 'discipline');
  });
});

describe('SupabaseTraitHypothesisRepository — confirm', () => {
  it('sets verified_at and source to user_confirm', async () => {
    const updatedRow = makeHypothesisRow({ id: 'h-1', source: 'user_confirm', verified_at: '2026-07-01T00:00:00.000Z' });

    const query = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updatedRow, error: null }),
    };
    const supabase = { from: jest.fn().mockReturnValue(query) };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const result = await repo.confirm('h-1', 'user-1');

    expect(result.source).toBe('user_confirm');
    expect(result.verifiedAt).not.toBeNull();
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'user_confirm' }),
    );
    expect(query.eq).toHaveBeenCalledWith('id', 'h-1');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('SupabaseTraitHypothesisRepository — hold', () => {
  it('sets status to needs_review and rejects already-dead rows', async () => {
    const updatedRow = makeHypothesisRow({ id: 'h-1', status: 'needs_review' });

    const query = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updatedRow, error: null }),
    };
    const supabase = { from: jest.fn().mockReturnValue(query) };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const result = await repo.hold('h-1', 'user-1');

    expect(result.status).toBe('needs_review');
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'needs_review' }),
    );
    expect(query.not).toHaveBeenCalledWith('status', 'in', expect.stringContaining('revised'));
  });
});

describe('SupabaseTraitHypothesisRepository — reviseAtomic', () => {
  it('calls revise_hypothesis_atomic RPC and returns mapped record', async () => {
    const returnedRow = makeHypothesisRow({ id: 'h-new', status: 'active', source: 'user_revision' });

    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: returnedRow, error: null }),
    };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    const next = {
      userId: 'user-1',
      traitKey: 'introversion',
      hypothesisLabel: 'high',
      hypothesisText: '修正された仮説',
      confidence: 0.75,
      uncertainty: 0.25,
      evidenceIds: ['e-1'],
      sourcePatternIds: [],
      modelName: 'mock',
      modelVersion: 'mirror_v001',
      promptVersion: 'mirror_v001',
      status: 'active' as const,
      source: 'user_revision' as const,
      revisedFromId: 'h-1',
      userCorrection: 'これが正しい',
      supersedesHypothesisId: 'h-1',
      analysisJobId: null,
    };

    const result = await repo.reviseAtomic('h-1', 'user-1', next);

    expect(result.id).toBe('h-new');
    expect(supabase.rpc).toHaveBeenCalledWith('revise_hypothesis_atomic', {
      p_user_id: 'user-1',
      p_prev_id: 'h-1',
      p_new_row: expect.objectContaining({ user_id: 'user-1', trait_key: 'introversion' }),
    });
  });

  it('throws InfrastructureError on RPC failure', async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'rpc failed' } }),
    };

    const repo = new SupabaseTraitHypothesisRepository(supabase as never);
    await expect(
      repo.reviseAtomic('h-1', 'user-1', {
        userId: 'user-1', traitKey: 'introversion', hypothesisLabel: 'high',
        hypothesisText: '修正', confidence: 0.5, uncertainty: 0.5,
        evidenceIds: [], sourcePatternIds: [], modelName: 'mock',
        modelVersion: 'v1', promptVersion: 'v1', status: 'active',
        source: 'user_revision', revisedFromId: 'h-1', userCorrection: 'x',
        supersedesHypothesisId: 'h-1', analysisJobId: null,
      }),
    ).rejects.toThrow('traitHypothesis:reviseAtomic failed');
  });
});
