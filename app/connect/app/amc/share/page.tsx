import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { generateR2PresignedUrl, sha256Hex } from '@/infrastructure/amc/amcCrypto';
import { ValidationError } from '@/core/errors/ValidationError';

async function loadSharePageData(
  token: string,
  viewerUserId: string,
  viewerGoogleSubject: string,
  viewerEmail: string | null,
) {
  const admin = createAdminClient();
  const tokenHash = sha256Hex(token);

  const { data: claim, error: claimError } = await admin.rpc('amc_claim_share_link', {
    p_token_hash: tokenHash,
    p_viewer_user_id: viewerUserId,
    p_viewer_google_subject: viewerGoogleSubject,
    p_viewer_email: viewerEmail,
  });

  if (claimError) {
    throw claimError;
  }

  const shareLink = (claim as { shareLink: { record_id: string; access_scope: string } }).shareLink;

  const { data: record, error: recordError } = await admin
    .from('amc_records')
    .select('*')
    .eq('id', shareLink.record_id)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new ValidationError('record_not_found');

  const { data: event, error: eventError } = await admin
    .from('amc_events')
    .select('id, title, starts_at, ends_at, timezone, source')
    .eq('id', record.event_id)
    .maybeSingle();

  if (eventError) throw eventError;

  const { data: attachments, error: attachmentsError } = await admin
    .from('amc_record_attachments')
    .select('*')
    .eq('record_id', record.id)
    .eq('status', 'ready')
    .order('created_at', { ascending: true });

  if (attachmentsError) throw attachmentsError;

  const r2AccountId = process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.AMC_R2_BUCKET ?? 'amc-yourselflm';

  const signedAttachments =
    r2AccountId && r2AccessKeyId && r2SecretAccessKey
      ? (attachments ?? []).map((attachment) => ({
        ...attachment,
          downloadUrl: generateR2PresignedUrl({
            accountId: r2AccountId,
            bucket: r2Bucket,
            key: attachment.r2_key,
            method: 'GET',
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
            expiresInSeconds: 900,
          }),
        }))
      : attachments ?? [];

  return {
    shareLink,
    record,
    event,
    attachments: signedAttachments,
  };
}

export default async function AmcSharePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  if (!c) {
    redirect('/login');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/connect/app/amc/share?c=${encodeURIComponent(c)}`)}`);
  }

  const admin = createAdminClient();
  const googleIdentity = await ensureGoogleIdentityLink(admin, user);

  let data:
    | Awaited<ReturnType<typeof loadSharePageData>>
    | null = null;
  let errorMessage: string | null = null;
  try {
    data = await loadSharePageData(c, user.id, googleIdentity.googleSubject, user.email ?? googleIdentity.googleEmail);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'share_link_error';
  }

  if (!data) {
    return (
      <main style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>AMC share view</h1>
        <p>{errorMessage ?? 'share_link_error'}</p>
      </main>
    );
  }

  const body = typeof data.record.current_body === 'string' ? data.record.current_body : '';
  const heading = data.event?.title ?? 'Shared record';

  return (
    <main style={{ padding: '24px', maxWidth: 960, margin: '0 auto', lineHeight: 1.6 }}>
      <p style={{ color: '#666' }}>AMC share view</p>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>{heading}</h1>
      <section style={{ padding: 16, background: '#f7f7f8', borderRadius: 12, marginBottom: 24 }}>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{body}</pre>
      </section>
      <section>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Attachments</h2>
        <ul style={{ paddingLeft: 20 }}>
          {(data.attachments ?? []).map((attachment) => (
            <li key={attachment.id} style={{ marginBottom: 12 }}>
              <a href={attachment.downloadUrl} target="_blank" rel="noreferrer">
                {attachment.attachment_type} / {attachment.mime_type}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
