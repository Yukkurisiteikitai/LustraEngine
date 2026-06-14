BEGIN;

CREATE TABLE IF NOT EXISTS amc_google_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_subject text NOT NULL UNIQUE,
  google_email text NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE amc_google_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_google_identities_select_own ON amc_google_identities
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY amc_google_identities_insert_own ON amc_google_identities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY amc_google_identities_update_own ON amc_google_identities
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS amc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_calendar_event_id text NULL,
  title text NOT NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  timezone text NULL,
  source text NOT NULL DEFAULT 'google_calendar',
  mirror_body text NULL,
  client_idempotency_key text NOT NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, client_idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS amc_events_owner_google_event_unique
  ON amc_events (owner_user_id, google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

ALTER TABLE amc_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_events_select_own ON amc_events
  FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY amc_events_insert_own ON amc_events
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY amc_events_update_own ON amc_events
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE IF NOT EXISTS amc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES amc_events(id) ON DELETE CASCADE,
  current_revision integer NOT NULL DEFAULT 1,
  current_body text NOT NULL DEFAULT '',
  body_format text NOT NULL DEFAULT 'plain',
  visibility text NOT NULL DEFAULT 'private',
  client_idempotency_key text NOT NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_records_visibility_check CHECK (
    visibility IN ('private', 'specific_users', 'friends', 'public', 'limited_public')
  ),
  CONSTRAINT amc_records_body_format_check CHECK (body_format IN ('plain', 'markdown')),
  UNIQUE (owner_user_id, client_idempotency_key)
);

ALTER TABLE amc_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_records_select_own ON amc_records
  FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY amc_records_insert_own ON amc_records
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY amc_records_update_own ON amc_records
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE IF NOT EXISTS amc_record_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES amc_records(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  body text NOT NULL,
  body_format text NOT NULL DEFAULT 'plain',
  edited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_record_revisions_body_format_check CHECK (body_format IN ('plain', 'markdown')),
  UNIQUE (record_id, revision_number),
  UNIQUE (record_id, client_idempotency_key)
);

ALTER TABLE amc_record_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_record_revisions_select_own ON amc_record_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM amc_records r
      WHERE r.id = record_id
        AND r.owner_user_id = auth.uid()
    )
  );

CREATE POLICY amc_record_revisions_insert_own ON amc_record_revisions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM amc_records r
      WHERE r.id = record_id
        AND r.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS amc_record_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES amc_records(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attachment_type text NOT NULL,
  r2_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  checksum text NULL,
  status text NOT NULL DEFAULT 'uploading',
  client_idempotency_key text NOT NULL,
  uploaded_at timestamptz NULL,
  ready_at timestamptz NULL,
  failed_at timestamptz NULL,
  retry_count integer NOT NULL DEFAULT 0,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_record_attachments_type_check CHECK (attachment_type IN ('image', 'audio')),
  CONSTRAINT amc_record_attachments_status_check CHECK (
    status IN ('uploading', 'ready', 'failed', 'deleted')
  ),
  UNIQUE (record_id, client_idempotency_key)
);

ALTER TABLE amc_record_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_record_attachments_select_own ON amc_record_attachments
  FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY amc_record_attachments_insert_own ON amc_record_attachments
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY amc_record_attachments_update_own ON amc_record_attachments
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE IF NOT EXISTS amc_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_friendships_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  UNIQUE (requester_user_id, addressee_user_id)
);

ALTER TABLE amc_friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_friendships_select_own ON amc_friendships
  FOR SELECT
  USING (auth.uid() = requester_user_id OR auth.uid() = addressee_user_id);

CREATE POLICY amc_friendships_insert_own ON amc_friendships
  FOR INSERT
  WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY amc_friendships_update_own ON amc_friendships
  FOR UPDATE
  USING (auth.uid() = requester_user_id OR auth.uid() = addressee_user_id)
  WITH CHECK (auth.uid() = requester_user_id OR auth.uid() = addressee_user_id);

CREATE TABLE IF NOT EXISTS amc_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES amc_records(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  access_scope text NOT NULL,
  expires_at timestamptz NULL,
  max_uses integer NULL,
  use_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz NULL,
  client_idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_share_links_scope_check CHECK (
    access_scope IN ('limited_public', 'public', 'specific_users', 'friends')
  ),
  UNIQUE (owner_user_id, client_idempotency_key)
);

ALTER TABLE amc_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_share_links_select_own ON amc_share_links
  FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY amc_share_links_insert_own ON amc_share_links
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY amc_share_links_update_own ON amc_share_links
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE IF NOT EXISTS amc_share_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES amc_records(id) ON DELETE CASCADE,
  share_link_id uuid NULL REFERENCES amc_share_links(id) ON DELETE CASCADE,
  grant_kind text NOT NULL,
  grantee_user_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grantee_google_subject text NULL,
  grantee_email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_share_grants_kind_check CHECK (
    grant_kind IN ('specific_user', 'friend', 'public', 'limited_public')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS amc_share_grants_unique_idx
  ON amc_share_grants (
    record_id,
    COALESCE(share_link_id, '00000000-0000-0000-0000-000000000000'::uuid),
    grant_kind,
    COALESCE(grantee_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(grantee_google_subject, ''),
    COALESCE(grantee_email, '')
  );

ALTER TABLE amc_share_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_share_grants_select_own ON amc_share_grants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM amc_records r
      WHERE r.id = record_id
        AND r.owner_user_id = auth.uid()
    )
  );

CREATE POLICY amc_share_grants_insert_own ON amc_share_grants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM amc_records r
      WHERE r.id = record_id
        AND r.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS amc_share_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES amc_records(id) ON DELETE CASCADE,
  share_link_id uuid NULL REFERENCES amc_share_links(id) ON DELETE SET NULL,
  viewer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_google_subject text NULL,
  access_scope text NOT NULL,
  result text NOT NULL,
  reason text NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_share_access_events_result_check CHECK (result IN ('granted', 'denied')),
  CONSTRAINT amc_share_access_events_scope_check CHECK (
    access_scope IN ('limited_public', 'public', 'specific_users', 'friends', 'private')
  )
);

ALTER TABLE amc_share_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY amc_share_access_events_select_own ON amc_share_access_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM amc_records r
      WHERE r.id = record_id
        AND r.owner_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.amc_init_record_bundle(
  p_owner_user_id uuid,
  p_record_idempotency_key text,
  p_event_idempotency_key text,
  p_event_title text,
  p_event_starts_at timestamptz DEFAULT NULL,
  p_event_ends_at timestamptz DEFAULT NULL,
  p_event_timezone text DEFAULT NULL,
  p_event_google_calendar_event_id text DEFAULT NULL,
  p_event_source text DEFAULT 'google_calendar',
  p_event_mirror_body text DEFAULT NULL,
  p_body text DEFAULT '',
  p_body_format text DEFAULT 'plain',
  p_visibility text DEFAULT 'private'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.amc_events%ROWTYPE;
  v_record public.amc_records%ROWTYPE;
BEGIN
  INSERT INTO public.amc_events (
    owner_user_id,
    google_calendar_event_id,
    title,
    starts_at,
    ends_at,
    timezone,
    source,
    mirror_body,
    client_idempotency_key
  )
  VALUES (
    p_owner_user_id,
    p_event_google_calendar_event_id,
    p_event_title,
    p_event_starts_at,
    p_event_ends_at,
    p_event_timezone,
    p_event_source,
    p_event_mirror_body,
    p_event_idempotency_key
  )
  ON CONFLICT (owner_user_id, client_idempotency_key)
  DO UPDATE SET updated_at = public.amc_events.updated_at
  RETURNING * INTO v_event;

  INSERT INTO public.amc_records (
    owner_user_id,
    event_id,
    current_body,
    body_format,
    visibility,
    client_idempotency_key
  )
  VALUES (
    p_owner_user_id,
    v_event.id,
    p_body,
    p_body_format,
    p_visibility,
    p_record_idempotency_key
  )
  ON CONFLICT (owner_user_id, client_idempotency_key)
  DO UPDATE SET updated_at = public.amc_records.updated_at
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'event', to_jsonb(v_event),
    'record', to_jsonb(v_record)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.amc_init_record_bundle(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amc_init_record_bundle(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.amc_save_record_revision(
  p_record_id uuid,
  p_editor_user_id uuid,
  p_expected_revision integer,
  p_body text,
  p_body_format text DEFAULT 'plain',
  p_client_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record public.amc_records%ROWTYPE;
  v_revision public.amc_record_revisions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_record
  FROM public.amc_records
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_record.owner_user_id <> p_editor_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'record_deleted' USING ERRCODE = 'P0001';
  END IF;

  IF p_client_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_revision
    FROM public.amc_record_revisions
    WHERE record_id = p_record_id
      AND client_idempotency_key = p_client_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'record', to_jsonb(v_record),
        'revision', to_jsonb(v_revision)
      );
    END IF;
  END IF;

  IF v_record.current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'revision_conflict' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.amc_record_revisions (
    record_id,
    revision_number,
    body,
    body_format,
    edited_by,
    client_idempotency_key
  )
  VALUES (
    p_record_id,
    v_record.current_revision + 1,
    p_body,
    p_body_format,
    p_editor_user_id,
    COALESCE(p_client_idempotency_key, gen_random_uuid()::text)
  )
  RETURNING * INTO v_revision;

  UPDATE public.amc_records
  SET
    current_revision = v_revision.revision_number,
    current_body = p_body,
    body_format = p_body_format,
    updated_at = now()
  WHERE id = p_record_id
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'record', to_jsonb(v_record),
    'revision', to_jsonb(v_revision)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.amc_save_record_revision(uuid, uuid, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amc_save_record_revision(uuid, uuid, integer, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.amc_create_share_link_bundle(
  p_owner_user_id uuid,
  p_record_id uuid,
  p_token_hash text,
  p_token_prefix text,
  p_access_scope text,
  p_expires_at timestamptz DEFAULT NULL,
  p_max_uses integer DEFAULT NULL,
  p_client_idempotency_key text DEFAULT NULL,
  p_grants jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.amc_share_links%ROWTYPE;
  v_grant jsonb;
BEGIN
  INSERT INTO public.amc_share_links (
    owner_user_id,
    record_id,
    token_hash,
    token_prefix,
    access_scope,
    expires_at,
    max_uses,
    client_idempotency_key
  )
  VALUES (
    p_owner_user_id,
    p_record_id,
    p_token_hash,
    p_token_prefix,
    p_access_scope,
    p_expires_at,
    p_max_uses,
    COALESCE(p_client_idempotency_key, gen_random_uuid()::text)
  )
  ON CONFLICT (owner_user_id, client_idempotency_key)
  DO UPDATE SET updated_at = public.amc_share_links.updated_at
  RETURNING * INTO v_link;

  IF jsonb_typeof(p_grants) = 'array' THEN
    FOR v_grant IN
      SELECT value FROM jsonb_array_elements(p_grants)
    LOOP
      INSERT INTO public.amc_share_grants (
        record_id,
        share_link_id,
        grant_kind,
        grantee_user_id,
        grantee_google_subject,
        grantee_email
      )
      VALUES (
        p_record_id,
        v_link.id,
        COALESCE(v_grant ->> 'grantKind', 'public'),
        NULLIF(v_grant ->> 'granteeUserId', '')::uuid,
        NULLIF(v_grant ->> 'granteeGoogleSubject', ''),
        NULLIF(v_grant ->> 'granteeEmail', '')
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('shareLink', to_jsonb(v_link));
END;
$$;

REVOKE ALL ON FUNCTION public.amc_create_share_link_bundle(uuid, uuid, text, text, text, timestamptz, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amc_create_share_link_bundle(uuid, uuid, text, text, text, timestamptz, integer, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.amc_claim_share_link(
  p_token_hash text,
  p_viewer_user_id uuid,
  p_viewer_google_subject text DEFAULT NULL,
  p_viewer_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.amc_share_links%ROWTYPE;
  v_owner_user_id uuid;
  v_specific_user_granted boolean := false;
  v_friend_granted boolean := false;
  v_friendship_accepted boolean := false;
  v_allowed boolean := false;
  v_reason text := 'denied';
BEGIN
  SELECT *
  INTO v_link
  FROM public.amc_share_links
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_link_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.owner_user_id
  INTO v_owner_user_id
  FROM public.amc_records r
  WHERE r.id = v_link.record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    INSERT INTO public.amc_share_access_events (
      record_id,
      share_link_id,
      viewer_user_id,
      access_scope,
      result,
      reason
    )
    VALUES (
      v_link.record_id,
      v_link.id,
      p_viewer_user_id,
      v_link.access_scope,
      'denied',
      'share_link_revoked'
    );
    RAISE EXCEPTION 'share_link_revoked' USING ERRCODE = 'P0001';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    INSERT INTO public.amc_share_access_events (
      record_id,
      share_link_id,
      viewer_user_id,
      access_scope,
      result,
      reason
    )
    VALUES (
      v_link.record_id,
      v_link.id,
      p_viewer_user_id,
      v_link.access_scope,
      'denied',
      'share_link_expired'
    );
    RAISE EXCEPTION 'share_link_expired' USING ERRCODE = 'P0001';
  END IF;

  IF v_link.max_uses IS NOT NULL AND v_link.use_count >= v_link.max_uses THEN
    INSERT INTO public.amc_share_access_events (
      record_id,
      share_link_id,
      viewer_user_id,
      access_scope,
      result,
      reason
    )
    VALUES (
      v_link.record_id,
      v_link.id,
      p_viewer_user_id,
      v_link.access_scope,
      'denied',
      'share_link_exhausted'
    );
    RAISE EXCEPTION 'share_link_exhausted' USING ERRCODE = 'P0001';
  END IF;

  IF p_viewer_user_id IS NULL THEN
    INSERT INTO public.amc_share_access_events (
      record_id,
      share_link_id,
      viewer_user_id,
      access_scope,
      result,
      reason
    )
    VALUES (
      v_link.record_id,
      v_link.id,
      NULL,
      v_link.access_scope,
      'denied',
      'authentication_required'
    );
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF p_viewer_user_id = v_owner_user_id THEN
    v_allowed := true;
    v_reason := 'owner';
  ELSIF v_link.access_scope = 'public' THEN
    v_allowed := true;
    v_reason := 'public';
  ELSIF v_link.access_scope = 'limited_public' THEN
    v_allowed := true;
    v_reason := 'limited_public';
  ELSIF v_link.access_scope = 'specific_users' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.amc_share_grants g
      WHERE g.share_link_id = v_link.id
        AND g.grant_kind = 'specific_user'
        AND (
          g.grantee_user_id = p_viewer_user_id
          OR (p_viewer_google_subject IS NOT NULL AND g.grantee_google_subject = p_viewer_google_subject)
          OR (p_viewer_email IS NOT NULL AND g.grantee_email = p_viewer_email)
        )
    )
    INTO v_specific_user_granted;
    v_allowed := v_specific_user_granted;
    v_reason := CASE WHEN v_allowed THEN 'specific_users' ELSE 'missing_specific_grant' END;
  ELSIF v_link.access_scope = 'friends' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.amc_share_grants g
      WHERE g.share_link_id = v_link.id
        AND g.grant_kind = 'friend'
    )
    INTO v_friend_granted;

    IF v_friend_granted THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.amc_friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_user_id = v_owner_user_id AND f.addressee_user_id = p_viewer_user_id)
            OR (f.requester_user_id = p_viewer_user_id AND f.addressee_user_id = v_owner_user_id)
          )
      )
      INTO v_friendship_accepted;
    END IF;

    v_allowed := v_friend_granted AND v_friendship_accepted;
    v_reason := CASE
      WHEN NOT v_friend_granted THEN 'missing_friend_grant'
      WHEN NOT v_friendship_accepted THEN 'missing_friendship'
      ELSE 'friends'
    END;
  ELSE
    RAISE EXCEPTION 'unsupported_access_scope' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_allowed THEN
    INSERT INTO public.amc_share_access_events (
      record_id,
      share_link_id,
      viewer_user_id,
      access_scope,
      result,
      reason
    )
    VALUES (
      v_link.record_id,
      v_link.id,
      p_viewer_user_id,
      v_link.access_scope,
      'denied',
      v_reason
    );
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.amc_share_links
  SET use_count = use_count + 1,
      updated_at = now()
  WHERE id = v_link.id
  RETURNING * INTO v_link;

  INSERT INTO public.amc_share_access_events (
    record_id,
    share_link_id,
    viewer_user_id,
    access_scope,
    result,
    reason
  )
  VALUES (
    v_link.record_id,
    v_link.id,
    p_viewer_user_id,
    v_link.access_scope,
    'granted',
    v_reason
  );

  RETURN jsonb_build_object('shareLink', to_jsonb(v_link));
END;
$$;

REVOKE ALL ON FUNCTION public.amc_claim_share_link(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amc_claim_share_link(text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.amc_tombstone_share_link(
  p_share_link_id uuid,
  p_owner_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.amc_share_links
  SET revoked_at = now(),
      updated_at = now()
  WHERE id = p_share_link_id
    AND owner_user_id = p_owner_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.amc_tombstone_share_link(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amc_tombstone_share_link(uuid, uuid) TO service_role;

CREATE INDEX IF NOT EXISTS amc_records_owner_visibility_idx
  ON public.amc_records (owner_user_id, visibility, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS amc_record_attachments_record_idx
  ON public.amc_record_attachments (record_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS amc_share_links_record_idx
  ON public.amc_share_links (record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS amc_share_access_events_record_idx
  ON public.amc_share_access_events (record_id, accessed_at DESC);

COMMIT;
