import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { PersonaMapper } from '@/application/mappers/PersonaMapper';
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

    const { persona } = createRepositories(supabase);
    const data = await persona.getLatest(user.id);

    if (!data) return NextResponse.json({ snapshot: null });

    const snapshot: PersonaSnapshot = {
      id: data.id,
      userId: data.userId,
      personaJson: data.personaJson,
      createdAt: data.createdAt,
    };

    return NextResponse.json({ snapshot });
  } catch (err) {
    return handleError(err);
  }
}
