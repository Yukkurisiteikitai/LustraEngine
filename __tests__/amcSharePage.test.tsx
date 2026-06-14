/**
 * @jest-environment node
 */

import AmcSharePage from '@/app/connect/app/amc/share/page';
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

describe('AMC share page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('passes the authenticated Google identity into the share-link claim RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        shareLink: {
          record_id: 'record-1',
          access_scope: 'public',
        },
      },
      error: null,
    });

    const recordQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'record-1',
          event_id: 'event-1',
          current_body: 'hello',
        },
        error: null,
      }),
    };

    const eventQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'event-1',
          title: 'Shared record',
          starts_at: null,
          ends_at: null,
          timezone: null,
          source: 'google_calendar',
        },
        error: null,
      }),
    };

    const attachmentsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const admin = {
      rpc,
      from: jest.fn((table: string) => {
        if (table === 'amc_records') return recordQuery;
        if (table === 'amc_events') return eventQuery;
        if (table === 'amc_record_attachments') return attachmentsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mockCreateAdminClient.mockReturnValue(admin);

    await AmcSharePage({
      searchParams: Promise.resolve({ c: 'share-token' }),
    });

    expect(rpc).toHaveBeenCalledWith(
      'amc_claim_share_link',
      expect.objectContaining({
        p_token_hash: expect.any(String),
        p_viewer_user_id: 'user-1',
        p_viewer_google_subject: 'google-subject-1',
        p_viewer_email: 'user@example.com',
      }),
    );
  });
});
