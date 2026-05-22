import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogViewClient from '@/app/logs/view/[id]/LogViewClient';

describe('LogViewClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a record and updates local state after actions', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();

    render(
      <LogViewClient
        experience={{
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
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '会議で緊張した' })).toBeInTheDocument();
    expect(screen.getByText('午後の会議')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '記録を削除する' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '除外する' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '除外する' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/logs/e-1',
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });

    expect(screen.getByText('記録を除外しました')).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('除外', { selector: 'span.statusBadge' })).toBeInTheDocument();
  });
});
