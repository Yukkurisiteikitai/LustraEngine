import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { AuthorizationError } from '@/core/errors/AuthorizationError';
import { handleError } from '@/lib/apiHelpers';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ shareLinkId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { shareLinkId } = await params;
    if (!shareLinkId) {
      throw new ValidationError('shareLinkIdが必要です');
    }

    const admin = createAdminClient();
    await ensureGoogleIdentityLink(admin, user);

    const { data, error } = await admin
      .from('amc_share_links')
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', shareLinkId)
      .eq('owner_user_id', user.id)
      .select('id, revoked_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new AuthorizationError('共有リンクを失効する権限がありません');
    }

    return NextResponse.json({ ok: true, shareLink: data });
  } catch (error) {
    return handleError(error);
  }
}
