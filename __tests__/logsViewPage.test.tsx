import { render, screen } from '@testing-library/react';
import { createRepositories } from '@/container/createRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import LogViewPage from '@/app/logs/view/[id]/page';

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('@/container/createRepositories', () => ({
  createRepositories: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

jest.mock('@/components/Header', () => function MockHeader() {
  return <header>Header</header>;
});

jest.mock('@/components/Footer', () => function MockFooter() {
  return <footer>Footer</footer>;
});

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;
const mockNotFound = notFound as unknown as jest.Mock;

describe('LogViewPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated users', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    await expect(LogViewPage({ params: Promise.resolve({ id: 'e-1' }) })).rejects.toThrow(
      'REDIRECT:/login',
    );
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('renders a selected record in a readable layout', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      experience: {
        findById: jest.fn().mockResolvedValue({
          id: 'e-1',
          userId: 'user-1',
          description: '会議で緊張した',
          stressLevel: 4,
          actionResult: 'CONFRONTED',
          source: 'manual',
          visibility: 'private',
          reportDifficulty: 3,
          careful: false,
          goal: '説明する',
          action: '話した',
          emotion: '不安',
          context: '午後の会議',
          actionMemo: '少し落ち着いた',
          domainKey: 'WORK',
          date: '2026-05-20',
          softDeletedAt: null,
        }),
      },
    });

    render(await LogViewPage({ params: Promise.resolve({ id: 'e-1' }) }));

    expect(screen.getByRole('heading', { name: '会議で緊張した' })).toBeInTheDocument();
    expect(screen.getByText('午後の会議')).toBeInTheDocument();
    expect(screen.getByText('少し落ち着いた')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '記録を削除する' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '除外する' })).toBeInTheDocument();
  });

  it('shows not found when the record does not exist', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      experience: {
        findById: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(LogViewPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(mockNotFound).toHaveBeenCalled();
  });
});
