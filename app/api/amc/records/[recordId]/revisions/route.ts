import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { AuthorizationError } from '@/core/errors/AuthorizationError';
import { ConcurrencyError } from '@/core/errors/ConcurrencyError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';

interface RevisionRequestBody {
  body: string;
  bodyFormat?: 'plain' | 'markdown';
  expectedRevision: number;
  idempotencyKey: string;
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

    checkBodySize(request, 64 * 1024);
    let body: RevisionRequestBody;
    try {
      body = (await request.json()) as RevisionRequestBody;
    } catch {
      throw new ValidationError('RevisionRequestBodyのJSONが不正です');
    }

    if (typeof body.body !== 'string') {
      throw new ValidationError('bodyはstringで指定してください');
    }
    if (body.bodyFormat !== undefined && body.bodyFormat !== 'plain' && body.bodyFormat !== 'markdown') {
      throw new ValidationError('bodyFormatはplainまたはmarkdownです');
    }
    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) {
      throw new ValidationError('expectedRevisionは1以上の整数で指定してください');
    }
    if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
      throw new ValidationError('idempotencyKeyは必須です');
    }

    const admin = createAdminClient();
    await ensureGoogleIdentityLink(admin, user);

    const { data, error } = await admin.rpc('amc_save_record_revision', {
      p_record_id: recordId,
      p_editor_user_id: user.id,
      p_expected_revision: body.expectedRevision,
      p_body: body.body,
      p_body_format: body.bodyFormat ?? 'plain',
      p_client_idempotency_key: body.idempotencyKey,
    });

    if (error) {
      if (error.code === 'P0002') {
        return NextResponse.json({ message: 'record_not_found' }, { status: 404 });
      }
      if (error.code === '42501') {
        throw new AuthorizationError('編集権限がありません');
      }
      if (error.message?.includes('revision_conflict')) {
        throw new ConcurrencyError('他の端末で更新されています。再読み込みしてください。');
      }
      if (error.message?.includes('record_deleted')) {
        throw new ConcurrencyError('削除済みレコードには更新できません');
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      record: (data as { record: unknown; revision: unknown }).record,
      revision: (data as { record: unknown; revision: unknown }).revision,
    });
  } catch (error) {
    return handleError(error);
  }
}
