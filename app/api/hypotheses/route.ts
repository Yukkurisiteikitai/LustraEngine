import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { traitHypothesis } = createRepositories(supabase);
    const hypotheses = await traitHypothesis.findLiveByUser(user.id);

    const dto = hypotheses.map((h) => ({
      id: h.id,
      traitKey: h.traitKey,
      hypothesisLabel: h.hypothesisLabel,
      hypothesisText: h.hypothesisText,
      confidence: h.confidence,
      uncertainty: h.uncertainty,
      status: h.status,
      source: h.source ?? 'model',
      verifiedAt: h.verifiedAt ?? null,
      createdAt: h.createdAt,
    }));

    return NextResponse.json({ hypotheses: dto });
  } catch (err) {
    return handleError(err);
  }
}
