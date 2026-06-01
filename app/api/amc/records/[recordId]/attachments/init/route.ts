import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import {
  generateR2PresignedUrl,
} from '@/infrastructure/amc/amcCrypto';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { AuthorizationError } from '@/core/errors/AuthorizationError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { AmcAttachmentType } from '@/infrastructure/amc/amcAccess';

const AMC_ATTACHMENT_TYPES: readonly AmcAttachmentType[] = ['image', 'audio'];
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
  'audio/ogg',
]);
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

interface AttachmentInitRequestBody {
  attachmentType: AmcAttachmentType;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
  idempotencyKey: string;
}

function requireR2Env() {
  const accountId = process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.AMC_R2_BUCKET ?? 'amc-yourselflm';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new ValidationError('R2署名用の環境変数が不足しています');
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
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

    checkBodySize(request, 16 * 1024);
    let body: AttachmentInitRequestBody;
    try {
      body = (await request.json()) as AttachmentInitRequestBody;
    } catch {
      throw new ValidationError('AttachmentInitRequestBodyのJSONが不正です');
    }

    if (!AMC_ATTACHMENT_TYPES.includes(body.attachmentType)) {
      throw new ValidationError('attachmentTypeはimageまたはaudioです');
    }
    if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
      throw new ValidationError('mimeTypeが許可されていません');
    }
    if (!Number.isFinite(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError(`sizeBytesは1〜${MAX_ATTACHMENT_BYTES}で指定してください`);
    }
    if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
      throw new ValidationError('idempotencyKeyは必須です');
    }

    const admin = createAdminClient();
    await ensureGoogleIdentityLink(admin, user);

    const { data: record, error: recordError } = await admin
      .from('amc_records')
      .select('id, owner_user_id, deleted_at')
      .eq('id', recordId)
      .maybeSingle();

    if (recordError) throw recordError;
    if (!record) {
      return NextResponse.json({ message: 'record_not_found' }, { status: 404 });
    }
    if (record.owner_user_id !== user.id) {
      throw new AuthorizationError('添付を追加する権限がありません');
    }
    if (record.deleted_at) {
      throw new ValidationError('削除済みレコードには添付できません');
    }

    const attachmentId = crypto.randomUUID();
    const r2Key = `users/${user.id}/records/${recordId}/attachments/${attachmentId}`;
    const attachmentPayload = {
      id: attachmentId,
      record_id: recordId,
      owner_user_id: user.id,
      attachment_type: body.attachmentType,
      r2_key: r2Key,
      mime_type: body.mimeType,
      size_bytes: body.sizeBytes,
      checksum: body.checksum ?? null,
      status: 'uploading',
      client_idempotency_key: body.idempotencyKey,
      retry_count: 0,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedAttachment, error: insertError } = await admin
      .from('amc_record_attachments')
      .insert(attachmentPayload)
      .select('*')
      .single();

    if (insertError) {
      const duplicateKey = (insertError as { code?: string }).code === '23505';
      if (!duplicateKey) throw insertError;

      const { data: existingAttachment, error: selectError } = await admin
        .from('amc_record_attachments')
        .select('*')
        .eq('record_id', recordId)
        .eq('client_idempotency_key', body.idempotencyKey)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!existingAttachment) {
        throw insertError;
      }

      const r2 = requireR2Env();
      const retryUploadUrl = generateR2PresignedUrl({
        accountId: r2.accountId,
        bucket: r2.bucket,
        key: existingAttachment.r2_key,
        method: 'PUT',
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
        expiresInSeconds: 3600,
        contentType: existingAttachment.mime_type,
      });

      return NextResponse.json({
        ok: true,
        attachment: existingAttachment,
        uploadUrl: retryUploadUrl,
        expiresInSeconds: 3600,
      });
    }

    const r2 = requireR2Env();
    const uploadUrl = generateR2PresignedUrl({
      accountId: r2.accountId,
      bucket: r2.bucket,
      key: insertedAttachment.r2_key,
      method: 'PUT',
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      expiresInSeconds: 3600,
      contentType: body.mimeType,
    });

    return NextResponse.json({
      ok: true,
      attachment: insertedAttachment,
      uploadUrl,
      expiresInSeconds: 3600,
    });
  } catch (error) {
    return handleError(error);
  }
}
