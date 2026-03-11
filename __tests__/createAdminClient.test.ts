import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as unknown as jest.Mock;
const ORIGINAL_ENV = process.env;

describe('createAdminClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws when SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL are both missing', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

    expect(() => createAdminClient()).toThrow(
      '[createAdminClient] Missing required environment variable: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL'
    );
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createAdminClient()).toThrow(
      '[createAdminClient] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY'
    );
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it('creates admin client when SUPABASE_URL is present', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://public.example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    const fakeClient = { fake: true };
    mockedCreateClient.mockReturnValue(fakeClient);

    const client = createAdminClient();

    expect(mockedCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role'
    );
    expect(client).toBe(fakeClient);
  });

  it('falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is absent', () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    const fakeClient = { fake: true };
    mockedCreateClient.mockReturnValue(fakeClient);

    const client = createAdminClient();

    expect(mockedCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role'
    );
    expect(client).toBe(fakeClient);
  });
});
