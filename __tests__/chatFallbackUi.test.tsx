import { render, screen, waitFor } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import ChatPage from '@/app/chat/page';
import { usePersona, useChatMutation } from '@/lib/mockQueryClient';
import { loadLMConfig } from '@/lib/lmConfig';

jest.mock('@/lib/mockQueryClient', () => ({
  usePersona: jest.fn(),
  useChatMutation: jest.fn(),
}));

jest.mock('@/lib/lmConfig', () => ({
  loadLMConfig: jest.fn(),
}));

jest.mock('@/components/Header', () => function MockHeader() {
  return <header>Header</header>;
});

jest.mock('@/components/Footer', () => function MockFooter() {
  return <footer>Footer</footer>;
});

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string | { pathname: string; query?: Record<string, string> };
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  }) {
    const resolvedHref =
      typeof href === 'string'
        ? href
        : `${href.pathname}${href.query?.template ? `?template=${encodeURIComponent(href.query.template)}` : ''}`;
    return (
      <a
        href={resolvedHref}
        {...props}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
      >
        {children}
      </a>
    );
  };
});

const mockUsePersona = usePersona as jest.Mock;
const mockUseChatMutation = useChatMutation as jest.Mock;
const mockLoadLMConfig = loadLMConfig as jest.Mock;

describe('Chat fallback UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    mockLoadLMConfig.mockReturnValue({ provider: 'openai', model: 'gpt-4.1' });
    mockUsePersona.mockReturnValue({
      data: {
        id: 'snapshot-1',
        userId: 'user-1',
        snapshotKind: 'hypothesis_summary',
        activeHypothesisCount: 0,
        topHypotheses: [],
        summaryText: '十分な仮説がありません。記録を追加するとモデル要約を更新できます。',
        evidenceCount: 0,
        createdAt: '2026-05-14T00:00:00.000Z',
      },
      isLoading: false,
    });
    mockUseChatMutation.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/chat/threads')) {
        return {
          ok: true,
          json: async () => ({ threads: [] }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof fetch;
  });

  it('shows evidence logging guidance and entry links when no hypotheses are active', async () => {
    render(<ChatPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/chat/threads');
    });

    expect(screen.getByRole('heading', { name: 'ユーザーモデル' })).toBeInTheDocument();
    expect(screen.getByText(/ここは現在の仮説要約です/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Evidence Logging' })).toBeInTheDocument();
    expect(
      screen.getByText('次の3問に答えると、判断材料として記録できます。書き終えたら、そのまま仮説更新へ進めます。'),
    ).toBeInTheDocument();
    expect(screen.getByText('直近で強く気になった出来事は何でしたか？')).toBeInTheDocument();
    expect(screen.getByText('出来事 / 感情 / 避けたこと or 向き合ったこと / 関係する領域')).toBeInTheDocument();

    const logLink = screen.getByRole('link', { name: '記録を追加する' });
    expect(logLink.getAttribute('href')).toBe('/log/new');

    expect(screen.getByRole('link', { name: '仮説を更新' })).toHaveAttribute('href', '/persona');
    expect(
      screen.getByPlaceholderText('メッセージを入力（Enter で送信、Shift+Enter で改行）'),
    ).toBeEnabled();
  });

  it('stores the draft in sessionStorage before navigating to /log/new', async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/chat/threads');
    });

    await user.click(screen.getByRole('link', { name: '記録を追加する' }));

    const raw = window.sessionStorage.getItem('ylm:evidence_logging_draft');
    expect(raw).not.toBeNull();
    expect(raw).toContain('chat_fallback');
    expect(raw).toContain('直近で強く気になった出来事は何でしたか？');
    expect(raw).not.toContain('?template=');
    expect(screen.getByRole('link', { name: '記録を追加する' })).toHaveAttribute('href', '/log/new');
  });
});
