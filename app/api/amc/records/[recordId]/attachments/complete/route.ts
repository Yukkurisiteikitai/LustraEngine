import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { AuthorizationError } from '@/core/errors/AuthorizationError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';

interface AttachmentCompleteRequestBody {
  attachmentId: string;
  checksum?: string | null;
  status?: 'ready' | 'failed';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { recordId } = await params;
    if (!recordId) {
      throw new ValidationError('recordIdが必要です');
    }

    checkBodySize(request, 8 * 1024);
    let body: AttachmentCompleteRequestBody;
    try {
      body = (await request.json()) as AttachmentCompleteRequestBody;
    } catch {
      throw new ValidationError('AttachmentCompleteRequestBodyのJSONが不正です');
    }

    if (!body.attachmentId || typeof body.attachmentId !== 'string') {
      throw new ValidationError('attachmentIdは必須です');
    }
    if (body.status !== undefined && body.status !== 'ready' && body.status !== 'failed') {
      throw new ValidationError('statusはreadyまたはfailedです');
    }

    const admin = createAdminClient();
    await ensureGoogleIdentityLink(admin, user);

    const { data: record, error: recordError } = await admin
      .from('amc_records')
      .select('id, owner_user_id')
      .eq('id', recordId)
      .maybeSingle();

    if (recordError) throw recordError;
    if (!record) {
      return NextResponse.json({ message: 'record_not_found' }, { status: 404 });
    }
    if (record.owner_user_id !== user.id) {
      throw new AuthorizationError('添付を更新する権限がありません');
    }

    const now = new Date().toISOString();
    const nextStatus = body.status ?? 'ready';
    const patch =
      nextStatus === 'ready'
        ? {
            status: 'ready',
            checksum: body.checksum ?? null,
            uploaded_at: now,
            ready_at: now,
            failed_at: null,
            updated_at: now,
          }
        : {
            status: 'failed',
            checksum: body.checksum ?? null,
            failed_at: now,
            updated_at: now,
          };

    const { data: attachment, error: attachmentError } = await admin
      .from('amc_record_attachments')
      .update(patch)
      .eq('id', body.attachmentId)
      .eq('record_id', recordId)
      .eq('owner_user_id', user.id)
      .select('*')
      .single();

    if (attachmentError) throw attachmentError;

    return NextResponse.json({
      ok: true,
      attachment,
    });
  } catch (error) {
    return handleError(error);
  }
}
