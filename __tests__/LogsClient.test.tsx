import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogsClient from '@/app/logs/LogsClient';

describe('LogsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests server-side search and replaces the list with results', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            experience: {
              id: 'e-2',
              userId: 'user-1',
              description: '別の記録',
              stressLevel: 5,
              actionResult: 'AVOIDED',
              source: 'manual',
              visibility: 'private',
              reportDifficulty: 3,
              careful: false,
              goal: '整理する',
              action: '話した',
              emotion: '不安',
              context: '会議の前に不安',
              actionMemo: 'メモ',
              domainKey: 'WORK',
              date: '2026-05-19',
              softDeletedAt: null,
            },
            matchedField: 'context',
            searchRank: 0.88,
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <LogsClient
        experiences={[
          {
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
          },
        ]}
      />,
    );

    await user.type(screen.getByLabelText('検索窓'), '不安');
    await user.selectOptions(screen.getByLabelText('項目'), 'context');
    await user.click(screen.getByRole('button', { name: '検索する' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/logs/search?'),
      );
    });

    expect(await screen.findByText('別の記録')).toBeInTheDocument();
    expect(screen.getByText('会議の前に不安')).toBeInTheDocument();
    expect(screen.getByText('1件見つかりました。')).toBeInTheDocument();
  });

  it('disables action buttons while a disposition update is in flight', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ ok: boolean }> }) => void;
    const fetchPromise = new Promise<{ ok: boolean; json: () => Promise<{ ok: boolean }> }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = jest.fn().mockReturnValue(fetchPromise);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <LogsClient
        experiences={[
          {
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
          },
        ]}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: '記録を削除する' });
    await user.click(deleteButton);

    expect(deleteButton).toBeDisabled();

    resolveFetch({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/logs/e-1',
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });
  });
});
