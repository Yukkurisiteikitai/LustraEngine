import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ConcurrencyError } from '@/core/errors/ConcurrencyError';
import { AuthError } from '@/core/errors/AuthError';

type IdentityLike = {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
};

export interface GoogleIdentityLink {
  googleSubject: string;
  googleEmail: string | null;
}

export function extractGoogleIdentity(user: User): GoogleIdentityLink | null {
  const identities = (user.identities ?? []) as IdentityLike[];
  const googleIdentity =
    identities.find((identity) => identity.provider === 'google') ??
    (user.app_metadata?.provider === 'google' ? identities[0] ?? null : null);

  if (!googleIdentity) {
    return null;
  }

  const identityData = googleIdentity.identity_data ?? undefined;
  const subject =
    (typeof identityData?.sub === 'string' && identityData.sub) ||
    (typeof identityData?.subject === 'string' && identityData.subject) ||
    null;

  if (!subject) {
    return null;
  }

  return {
    googleSubject: subject,
    googleEmail:
      typeof user.email === 'string'
        ? user.email
        : typeof identityData?.email === 'string'
          ? identityData.email
          : null,
  };
}

export async function ensureGoogleIdentityLink(
  supabase: SupabaseClient,
  user: User,
): Promise<GoogleIdentityLink> {
  const identity = extractGoogleIdentity(user);
  if (!identity) {
    throw new AuthError('Googleアカウントでのログインが必要です');
  }

  const { data: bySubject, error: subjectError } = await supabase
    .from('amc_google_identities')
    .select('id, user_id, google_subject, google_email')
    .eq('google_subject', identity.googleSubject)
    .maybeSingle();

  if (subjectError) {
    throw subjectError;
  }

  if (bySubject && bySubject.user_id !== user.id) {
    throw new ConcurrencyError('このGoogleアカウントは別のYourselfLMユーザーに既に紐付いています');
  }

  const { data: byUser, error: userError } = await supabase
    .from('amc_google_identities')
    .select('id, user_id, google_subject, google_email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (byUser && byUser.google_subject !== identity.googleSubject) {
    throw new ConcurrencyError('このYourselfLMユーザーには別のGoogle subjectが既に紐付いています');
  }

  if (!bySubject && !byUser) {
    const { error: insertError } = await supabase.from('amc_google_identities').insert({
      user_id: user.id,
      google_subject: identity.googleSubject,
      google_email: identity.googleEmail,
    });

    if (insertError) {
      const duplicate = (insertError as { code?: string }).code === '23505';
      if (!duplicate) {
        throw insertError;
      }

      const { data: reloaded, error: reloadError } = await supabase
        .from('amc_google_identities')
        .select('id, user_id, google_subject, google_email')
        .eq('google_subject', identity.googleSubject)
        .maybeSingle();

      if (reloadError) {
        throw reloadError;
      }
      if (!reloaded || reloaded.user_id !== user.id) {
        throw new ConcurrencyError('このGoogleアカウントは別のYourselfLMユーザーに既に紐付いています');
      }
    }
  } else if (byUser && byUser.google_email !== identity.googleEmail) {
    const { error: updateError } = await supabase
      .from('amc_google_identities')
      .update({
        google_email: identity.googleEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }
  }

  return identity;
}
