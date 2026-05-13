import { render, screen } from '@testing-library/react';
import LogNewPage from '@/app/log/new/page';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

jest.mock('@/components/Header', () => function MockHeader() {
  return <header>Header</header>;
});

jest.mock('@/components/Footer', () => function MockFooter() {
  return <footer>Footer</footer>;
});

jest.mock('@/app/log/new/LogNewClient', () => function MockLogNewClient() {
  return <div>LogNewClient rendered</div>;
});

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

describe('LogNewPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated users to login', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    await expect(LogNewPage()).rejects.toThrow('REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('renders the client recording flow for authenticated users', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });

    render(await LogNewPage());

    expect(screen.getByRole('heading', { name: '今日の記録' })).toBeInTheDocument();
    expect(screen.getByText('LogNewClient rendered')).toBeInTheDocument();
  });
});
