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

jest.mock('@/lib/mockQueryClient', () => ({
  useSubmitLogMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

describe('LogNewPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('redirects unauthenticated users to login', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    await expect(LogNewPage({})).rejects.toThrow('REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('renders fallback draft values for authenticated users', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    window.sessionStorage.setItem(
      'ylm:evidence_logging_draft',
      JSON.stringify({
        template: 'foo',
        questions: ['q1', 'q2'],
        source: 'chat_fallback',
      }),
    );

    render(await LogNewPage({}));

    expect(screen.getByRole('heading', { name: '今日の記録' })).toBeInTheDocument();
    expect(screen.getByText('Chat からの下書き')).toBeInTheDocument();
    expect(screen.getByText('q1')).toBeInTheDocument();
    expect(screen.getByLabelText('いま、どのような障害に向き合っていますか？')).toHaveValue('foo');
    expect(screen.getByText(/evidenceType: chat_fallback/)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('ylm:evidence_logging_draft')).toBeNull();
  });
});
