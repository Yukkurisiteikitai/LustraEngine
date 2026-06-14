import { render, screen } from '@testing-library/react';
import { buildFallbackUserSettings } from '@/core/domains/user-settings/UserSettings';
import { createRepositories } from '@/container/createRepositories';
import LogNewPage from '@/app/log/new/page';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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

jest.mock('@/lib/mockQueryClient', () => ({
  useSubmitLogMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useExtractDiaryMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
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

  it('lazy creates default settings and uses them for authenticated users', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const ensureDefaultByUser = jest.fn().mockResolvedValue(buildFallbackUserSettings('user-1'));
    mockCreateRepositories.mockReturnValue({
      userSettings: {
        ensureDefaultByUser,
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

    expect(ensureDefaultByUser).toHaveBeenCalledWith('user-1');
    expect(screen.getByRole('heading', { name: '今日の記録' })).toBeInTheDocument();
    expect(screen.getByText(/ここでは出来事を記録します/)).toBeInTheDocument();
    expect(screen.getByText('Chat からの下書き')).toBeInTheDocument();
    expect(screen.getByText('q1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/スタバで2時間レポート/)).toHaveValue('foo');
    expect(screen.getByText(/evidenceType: chat_fallback/)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('ylm:evidence_logging_draft')).toBeNull();
  });

  it('does not restore stale drafts when fallback drafts are disabled', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    const ensureDefaultByUser = jest.fn().mockResolvedValue({
      ...buildFallbackUserSettings('user-1'),
      allowChatFallbackDraft: false,
    });
    mockCreateRepositories.mockReturnValue({
      userSettings: {
        ensureDefaultByUser,
      },
    });
    window.sessionStorage.setItem(
      'ylm:evidence_logging_draft',
      JSON.stringify({
        template: 'stale template',
        questions: ['stale q1'],
        source: 'chat_fallback',
      }),
    );

    render(await LogNewPage({}));

    expect(ensureDefaultByUser).toHaveBeenCalledWith('user-1');
    expect(screen.queryByText('Chat からの下書き')).not.toBeInTheDocument();
    expect(screen.queryByText('stale q1')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('ylm:evidence_logging_draft')).toBeNull();
  });
});
