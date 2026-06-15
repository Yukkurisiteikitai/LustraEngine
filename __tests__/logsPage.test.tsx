import { render, screen } from '@testing-library/react';
import { createRepositories } from '@/container/createRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LogsPage from '@/app/logs/page';

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

describe('LogsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated users', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    await expect(LogsPage()).rejects.toThrow('REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('loads recent experiences for the archive view', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const findRecent = jest.fn().mockResolvedValue([
      {
        id: 'e-1',
        userId: 'user-1',
        description: '会議で緊張した',
        stressLevel: 4,
        actionResult: 'CONFRONTED_SUCCESS',
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
      },
    ]);
    mockCreateRepositories.mockReturnValue({
      experience: {
        findRecent,
      },
    });

    render(await LogsPage());

    expect(findRecent).toHaveBeenCalledWith('user-1', 40);
    expect(screen.getByRole('heading', { name: '記録を読み返す' })).toBeInTheDocument();
  });
});
