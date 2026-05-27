import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { buildShareToken } from '@/infrastructure/amc/amcCrypto';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { AuthorizationError } from '@/core/errors/AuthorizationError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { AmcAccessScope, AmcShareGrantKind } from '@/infrastructure/amc/amcAccess';

interface ShareLinkGrantInput {
  grantKind: AmcShareGrantKind;
  granteeUserId?: string | null;
  granteeGoogleSubject?: string | null;
  granteeEmail?: string | null;
}

interface ShareLinkCreateRequestBody {
  recordId: string;
  accessScope: AmcAccessScope;
  idempotencyKey: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  grants?: ShareLinkGrantInput[];
}

const AMC_ACCESS_SCOPES: readonly AmcAccessScope[] = [
  'private',
  'specific_users',
  'friends',
  'public',
  'limited_public',
];

function isAccessScope(value: unknown): value is AmcAccessScope {
  return AMC_ACCESS_SCOPES.includes(value as AmcAccessScope);
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(request, 32 * 1024);
    let body: ShareLinkCreateRequestBody;
    try {
      body = (await request.json()) as ShareLinkCreateRequestBody;
    } catch {
      throw new ValidationError('ShareLinkCreateRequestBodyのJSONが不正です');
    }

    if (!body.recordId || typeof body.recordId !== 'string') {
      throw new ValidationError('recordIdは必須です');
    }
    if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
      throw new ValidationError('idempotencyKeyは必須です');
    }
    if (!isAccessScope(body.accessScope)) {
      throw new ValidationError('accessScopeの値が不正です');
    }
    if (body.maxUses !== undefined && body.maxUses !== null && (!Number.isInteger(body.maxUses) || body.maxUses < 1)) {
      throw new ValidationError('maxUsesは1以上の整数で指定してください');
    }
    if (
      body.expiresAt !== undefined &&
      body.expiresAt !== null &&
      Number.isNaN(Date.parse(body.expiresAt))
    ) {
      throw new ValidationError('expiresAtの形式が不正です');
    }

    const grants = Array.isArray(body.grants) ? body.grants : [];
    if (body.accessScope === 'specific_users' && grants.length === 0) {
      throw new ValidationError('specific_usersではgrantsが1件以上必要です');
    }

    const admin = createAdminClient();
    await ensureGoogleIdentityLink(admin, user);

    const { data: record, error: recordError } = await admin
      .from('amc_records')
      .select('id, owner_user_id, deleted_at')
      .eq('id', body.recordId)
      .maybeSingle();

    if (recordError) throw recordError;
    if (!record) {
      return NextResponse.json({ message: 'record_not_found' }, { status: 404 });
    }
    if (record.owner_user_id !== user.id) {
      throw new AuthorizationError('共有リンクを作成する権限がありません');
    }
    if (record.deleted_at) {
      throw new ValidationError('削除済みレコードには共有リンクを作成できません');
    }

    const shareToken = buildShareToken();
    const grantsPayload =
      grants.length > 0
        ? grants
        : body.accessScope === 'public'
          ? [{ grantKind: 'public' as const }]
          : body.accessScope === 'friends'
            ? [{ grantKind: 'friend' as const }]
            : body.accessScope === 'limited_public'
              ? [{ grantKind: 'limited_public' as const }]
              : [];

    const { data, error } = await admin.rpc('amc_create_share_link_bundle', {
      p_owner_user_id: user.id,
      p_record_id: body.recordId,
      p_token_hash: shareToken.tokenHash,
      p_token_prefix: shareToken.tokenPrefix,
      p_access_scope: body.accessScope,
      p_expires_at: body.expiresAt ?? null,
      p_max_uses: body.maxUses ?? null,
      p_client_idempotency_key: body.idempotencyKey,
      p_grants: grantsPayload,
    });

    if (error) throw error;

    const shareLink = (data as { shareLink: unknown }).shareLink;

    return NextResponse.json({
      ok: true,
      shareLink,
      shareToken: shareToken.token,
      shareUrl: `/connect/app/amc/share?c=${encodeURIComponent(shareToken.token)}`,
    });
  } catch (error) {
    return handleError(error);
  }
}
