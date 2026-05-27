export type AmcVisibility =
  | 'private'
  | 'specific_users'
  | 'friends'
  | 'public'
  | 'limited_public';

export type AmcAttachmentType = 'image' | 'audio';

export type AmcAccessScope =
  | 'private'
  | 'specific_users'
  | 'friends'
  | 'public'
  | 'limited_public';

export type AmcShareGrantKind = 'specific_user' | 'friend' | 'public' | 'limited_public';

export interface AmcRecordRow {
  id: string;
  owner_user_id: string;
  event_id: string;
  current_revision: number;
  current_body: string;
  body_format: 'plain' | 'markdown';
  visibility: AmcVisibility;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AmcEventRow {
  id: string;
  owner_user_id: string;
  google_calendar_event_id: string | null;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  source: string;
  mirror_body: string | null;
  client_idempotency_key: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AmcRevisionRow {
  id: string;
  record_id: string;
  revision_number: number;
  body: string;
  body_format: 'plain' | 'markdown';
  edited_by: string;
  client_idempotency_key: string;
  created_at: string;
}

export interface AmcAttachmentRow {
  id: string;
  record_id: string;
  owner_user_id: string;
  attachment_type: AmcAttachmentType;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  status: 'uploading' | 'ready' | 'failed' | 'deleted';
  client_idempotency_key: string;
  uploaded_at: string | null;
  ready_at: string | null;
  failed_at: string | null;
  retry_count: number;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AmcShareLinkRow {
  id: string;
  owner_user_id: string;
  record_id: string;
  token_hash: string;
  token_prefix: string;
  access_scope: AmcAccessScope;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  client_idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface AmcShareGrantRow {
  id: string;
  record_id: string;
  share_link_id: string | null;
  grant_kind: AmcShareGrantKind;
  grantee_user_id: string | null;
  grantee_google_subject: string | null;
  grantee_email: string | null;
  created_at: string;
}

export interface AmcShareAccessEventRow {
  id: string;
  record_id: string;
  share_link_id: string | null;
  viewer_user_id: string | null;
  viewer_google_subject: string | null;
  access_scope: AmcAccessScope;
  result: 'granted' | 'denied';
  reason: string | null;
  accessed_at: string;
}
