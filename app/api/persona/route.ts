import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
import type { PersonaSnapshot } from '@/types';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { persona, psychology } = createRepositories(supabase);
    const [data, bigFive, attachment, identityStatus] = await Promise.all([
      persona.getLatest(user.id),
      psychology.getBigFiveScore(user.id),
      psychology.getAttachmentProfile(user.id),
      psychology.getIdentityStatus(user.id),
    ]);

    if (!data) return NextResponse.json({ snapshot: null, bigFive: null, attachment: null, identityStatus: [] });

    const snapshot: PersonaSnapshot = {
      id: data.id,
      userId: data.userId,
      personaJson: data.personaJson,
      createdAt: data.createdAt,
    };

    return NextResponse.json({ snapshot, bigFive, attachment, identityStatus });
  } catch (err) {
    return handleError(err);
  }
}
