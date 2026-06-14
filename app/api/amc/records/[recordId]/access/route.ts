import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { AuthorizationError } from '@/core/errors/AuthorizationError';
import { handleError } from '@/lib/apiHelpers';

function isFriendshipAccepted(
  friendships: Array<{ requester_user_id: string; addressee_user_id: string; status: string }>,
  ownerUserId: string,
  viewerUserId: string,
): boolean {
  return friendships.some(
    (friendship) =>
      friendship.status === 'accepted' &&
      ((friendship.requester_user_id === ownerUserId &&
        friendship.addressee_user_id === viewerUserId) ||
        (friendship.requester_user_id === viewerUserId &&
          friendship.addressee_user_id === ownerUserId)),
  );
}

export async function GET(
  _request: Request,
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

    const admin = createAdminClient();
    const googleIdentity = await ensureGoogleIdentityLink(admin, user);

    const { data: record, error: recordError } = await admin
      .from('amc_records')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();

    if (recordError) throw recordError;
    if (!record) {
      return NextResponse.json({ message: 'record_not_found' }, { status: 404 });
    }

    const isOwner = record.owner_user_id === user.id;
    const deleted = Boolean(record.deleted_at);

    const { data: attachments, error: attachmentsError } = await admin
      .from('amc_record_attachments')
      .select('*')
      .eq('record_id', recordId)
      .order('created_at', { ascending: true });

    if (attachmentsError) throw attachmentsError;

    const { data: grants, error: grantsError } = await admin
      .from('amc_share_grants')
      .select('grant_kind, grantee_user_id, grantee_google_subject, grantee_email')
      .eq('record_id', recordId);

    if (grantsError) throw grantsError;

    const { data: friendships, error: friendshipsError } = await admin
      .from('amc_friendships')
      .select('requester_user_id, addressee_user_id, status')
      .or(`requester_user_id.eq.${record.owner_user_id},addressee_user_id.eq.${record.owner_user_id}`);

    if (friendshipsError) throw friendshipsError;

    let canAccess = false;
    let accessReason = 'denied';

    if (isOwner) {
      canAccess = true;
      accessReason = 'owner';
    } else if (deleted) {
      canAccess = false;
      accessReason = 'deleted';
    } else if (record.visibility === 'public') {
      canAccess = true;
      accessReason = 'public';
    } else if (record.visibility === 'specific_users') {
      canAccess =
        (grants ?? []).some(
          (grant) =>
            grant.grant_kind === 'specific_user' &&
            (grant.grantee_user_id === user.id ||
              grant.grantee_google_subject === googleIdentity.googleSubject ||
              grant.grantee_email === user.email),
        ) || false;
      accessReason = canAccess ? 'specific_users' : 'missing_specific_grant';
    } else if (record.visibility === 'friends') {
      const hasFriendGrant = (grants ?? []).some((grant) => grant.grant_kind === 'friend');
      canAccess = hasFriendGrant && isFriendshipAccepted(friendships ?? [], record.owner_user_id, user.id);
      accessReason = canAccess ? 'friends' : 'missing_friend_grant';
    } else if (record.visibility === 'limited_public') {
      canAccess = false;
      accessReason = 'token_required';
    } else {
      canAccess = false;
      accessReason = 'unsupported_visibility';
    }

    const { error: eventError } = await admin.from('amc_share_access_events').insert({
      record_id: recordId,
      viewer_user_id: user.id,
      viewer_google_subject: googleIdentity.googleSubject,
      access_scope: record.visibility,
      result: canAccess ? 'granted' : 'denied',
      reason: accessReason,
    });

    if (eventError) {
      console.warn('[amc:access] access event insert failed', eventError);
    }

    if (!canAccess) {
      if (deleted || record.visibility === 'private') {
        return NextResponse.json({ message: 'record_not_found' }, { status: 404 });
      }
      if (record.visibility === 'limited_public') {
        throw new AuthorizationError('共有コードによるアクセスが必要です');
      }
      throw new AuthorizationError('閲覧権限がありません');
    }

    return NextResponse.json({
      ok: true,
      record: {
        id: record.id,
        ownerUserId: record.owner_user_id,
        eventId: record.event_id,
        currentRevision: record.current_revision,
        bodyFormat: record.body_format,
        visibility: record.visibility,
        deletedAt: record.deleted_at,
        deletedBy: record.deleted_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      },
      attachments: (attachments ?? []).map((attachment) => ({
        id: attachment.id,
        type: attachment.attachment_type,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        status: attachment.status,
        uploadedAt: attachment.uploaded_at,
        readyAt: attachment.ready_at,
        failedAt: attachment.failed_at,
      })),
      access: {
        canEdit: isOwner,
        canDelete: isOwner,
        reason: accessReason,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
