import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { AmcVisibility } from '@/infrastructure/amc/amcAccess';

const AMC_VISIBILITIES: readonly AmcVisibility[] = [
  'private',
  'specific_users',
  'friends',
  'public',
  'limited_public',
];

interface AmcRecordInitRequest {
  event: {
    title: string;
    startsAt?: string | null;
    endsAt?: string | null;
    timezone?: string | null;
    googleCalendarEventId?: string | null;
    source?: string;
    mirrorBody?: string | null;
  };
  body: string;
  bodyFormat?: 'plain' | 'markdown';
  visibility?: AmcVisibility;
  recordIdempotencyKey: string;
  eventIdempotencyKey: string;
}

function isAmcVisibility(value: unknown): value is AmcVisibility {
  return AMC_VISIBILITIES.includes(value as AmcVisibility);
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(request, 64 * 1024);
    let body: AmcRecordInitRequest;
    try {
      body = (await request.json()) as AmcRecordInitRequest;
    } catch {
      throw new ValidationError('AmcRecordInitRequest形式のJSONが不正です');
    }

    if (!body.event || typeof body.event !== 'object') {
      throw new ValidationError('eventは必須です');
    }
    if (typeof body.event.title !== 'string' || body.event.title.trim() === '') {
      throw new ValidationError('event.titleは必須です');
    }
    if (typeof body.body !== 'string') {
      throw new ValidationError('bodyはstringで指定してください');
    }
    if (!body.recordIdempotencyKey || typeof body.recordIdempotencyKey !== 'string') {
      throw new ValidationError('recordIdempotencyKeyは必須です');
    }
    if (!body.eventIdempotencyKey || typeof body.eventIdempotencyKey !== 'string') {
      throw new ValidationError('eventIdempotencyKeyは必須です');
    }
    if (body.visibility !== undefined && !isAmcVisibility(body.visibility)) {
      throw new ValidationError('visibilityの値が不正です');
    }
    if (
      body.bodyFormat !== undefined &&
      body.bodyFormat !== 'plain' &&
      body.bodyFormat !== 'markdown'
    ) {
      throw new ValidationError('bodyFormatはplainまたはmarkdownです');
    }
    if (body.event.startsAt !== undefined && body.event.startsAt !== null && Number.isNaN(Date.parse(body.event.startsAt))) {
      throw new ValidationError('event.startsAtの形式が不正です');
    }
    if (body.event.endsAt !== undefined && body.event.endsAt !== null && Number.isNaN(Date.parse(body.event.endsAt))) {
      throw new ValidationError('event.endsAtの形式が不正です');
    }

    const admin = createAdminClient();
    const googleIdentity = await ensureGoogleIdentityLink(admin, user);

    const { data, error } = await admin.rpc('amc_init_record_bundle', {
      p_owner_user_id: user.id,
      p_record_idempotency_key: body.recordIdempotencyKey,
      p_event_idempotency_key: body.eventIdempotencyKey,
      p_event_title: body.event.title.trim(),
      p_event_starts_at: body.event.startsAt ?? null,
      p_event_ends_at: body.event.endsAt ?? null,
      p_event_timezone: body.event.timezone ?? null,
      p_event_google_calendar_event_id: body.event.googleCalendarEventId ?? null,
      p_event_source: body.event.source ?? 'google_calendar',
      p_event_mirror_body: body.event.mirrorBody ?? null,
      p_body: body.body,
      p_body_format: body.bodyFormat ?? 'plain',
      p_visibility: body.visibility ?? 'private',
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      googleSubject: googleIdentity.googleSubject,
      event: (data as { event: unknown; record: unknown }).event,
      record: (data as { event: unknown; record: unknown }).record,
    });
  } catch (error) {
    return handleError(error);
  }
}
