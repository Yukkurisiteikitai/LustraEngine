/**
 * @jest-environment node
 */

import { POST } from '@/app/api/amc/records/[recordId]/attachments/init/route';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { ensureGoogleIdentityLink } from '@/infrastructure/amc/amcAuth';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/infrastructure/supabase/createAdminClient', () => ({
  createAdminClient: jest.fn(),
}));

jest.mock('@/infrastructure/amc/amcAuth', () => ({
  ensureGoogleIdentityLink: jest.fn(),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;
const mockEnsureGoogleIdentityLink = ensureGoogleIdentityLink as jest.Mock;

describe('/api/amc/records/[recordId]/attachments/init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.R2_ACCOUNT_ID = '123456789abcdef';
    process.env.R2_ACCESS_KEY_ID = 'AKIAEXAMPLE';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.AMC_R2_BUCKET = 'amc-yourselflm';

    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
        }),
      },
    });
    mockEnsureGoogleIdentityLink.mockResolvedValue({
      googleSubject: 'google-subject-1',
      googleEmail: 'user@example.com',
    });
  });

  it('returns the existing attachment on an idempotent retry', async () => {
    const existingAttachment = {
      id: 'att-existing',
      record_id: 'record-1',
      owner_user_id: 'user-1',
      attachment_type: 'image',
      r2_key: 'users/user-1/records/record-1/attachments/att-existing',
      mime_type: 'image/png',
      size_bytes: 1234,
      checksum: null,
      status: 'uploading',
      client_idempotency_key: 'idem-1',
      uploaded_at: null,
      ready_at: null,
      failed_at: null,
      retry_count: 0,
      deleted_at: null,
      deleted_by: null,
      created_at: '2026-05-27T00:00:00.000Z',
      updated_at: '2026-05-27T00:00:00.000Z',
    };

    const recordQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'record-1', owner_user_id: 'user-1', deleted_at: null },
        error: null,
      }),
    };

    const attachmentInsertChain = {
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }),
    };

    const attachmentSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: existingAttachment,
        error: null,
      }),
    };

    const admin = {
      from: jest.fn((table: string) => {
        if (table === 'amc_records') return recordQuery;
        if (table === 'amc_record_attachments') {
          return {
            insert: jest.fn().mockReturnValue(attachmentInsertChain),
            select: jest.fn().mockReturnValue(attachmentSelectChain),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mockCreateAdminClient.mockReturnValue(admin);

    const response = await POST(
      new Request('http://localhost/api/amc/records/record-1/attachments/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          attachmentType: 'image',
          mimeType: 'image/png',
          sizeBytes: 1234,
          checksum: null,
          idempotencyKey: 'idem-1',
        }),
      }),
      { params: Promise.resolve({ recordId: 'record-1' }) },
    );

    const json = (await response.json()) as {
      ok: boolean;
      attachment: { id: string; r2_key: string };
      uploadUrl: string;
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.attachment.id).toBe(existingAttachment.id);
    expect(json.attachment.r2_key).toBe(existingAttachment.r2_key);
    expect(json.uploadUrl).toContain(existingAttachment.r2_key);
  });
});
