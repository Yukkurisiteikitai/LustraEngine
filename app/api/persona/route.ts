import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
import { buildUserModelSnapshot } from '@/application/mappers/UserModelSnapshotMapper';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { psychology, traitHypothesis } = createRepositories(supabase);
    const [data, bigFive, attachment, identityStatus] = await Promise.all([
      traitHypothesis.findActiveByUser(user.id),
      psychology.getBigFiveScore(user.id),
      psychology.getAttachmentProfile(user.id),
      psychology.getIdentityStatus(user.id),
    ]);

    const snapshot = buildUserModelSnapshot(user.id, data ?? []);

    return NextResponse.json({ snapshot, bigFive, attachment, identityStatus });
  } catch (err) {
    return handleError(err);
  }
}
