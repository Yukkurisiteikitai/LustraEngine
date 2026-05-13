import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogNewClient from '@/app/log/new/LogNewClient';
import { useSubmitLogMutation } from '@/lib/mockQueryClient';

jest.mock('@/lib/mockQueryClient', () => ({
  useSubmitLogMutation: jest.fn(),
}));

const mockUseSubmitLogMutation = useSubmitLogMutation as jest.Mock;

function setupMutation(mutate: jest.Mock) {
  mockUseSubmitLogMutation.mockReturnValue({
    mutate,
    isPending: false,
  });
}

async function completeWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('いま、どのような障害に向き合っていますか？'), '上司に相談する');
  await user.click(screen.getByRole('button', { name: '次へ' }));

  await user.click(screen.getByRole('button', { name: '仕事' }));
  await user.click(screen.getByRole('button', { name: '次へ' }));

  await user.type(screen.getByLabelText('そのとき、どのような感情でしたか？（任意）'), '不安');
  await user.type(screen.getByLabelText('どのような状況でしたか？（任意）'), '夜、一人で部屋にいた');
  await user.type(screen.getByLabelText('本来、何をしようとしていましたか？（任意）'), '英語の勉強');
  await user.click(screen.getByRole('button', { name: '次へ' }));

  await user.click(screen.getByLabelText('向き合った'));
  await user.type(screen.getByLabelText('実際にしたこと（任意）'), 'メールした');
  await user.type(screen.getByLabelText('追加メモ（任意）'), '5分だけ取り組んだ');
  await user.click(screen.getByRole('button', { name: '次へ' }));
}

describe('LogNewClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T00:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('submits the existing /api/logs payload shape', async () => {
    const mutate = jest.fn();
    setupMutation(mutate);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<LogNewClient />);
    await completeWizard(user);
    await user.click(screen.getByRole('button', { name: '送信する' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchInlineSnapshot(`
{
  "date": "2026-05-13",
  "obstacles": [
    {
      "action": "メールした",
      "actionMemo": "5分だけ取り組んだ",
      "actionResult": "CONFRONTED",
      "context": "夜、一人で部屋にいた",
      "description": "上司に相談する",
      "domain": "WORK",
      "emotion": "不安",
      "goal": "英語の勉強",
      "stressLevel": 3,
    },
  ],
}
`);
  });

  it('resets the form after a successful submit', async () => {
    const mutate = jest.fn((_payload, options) => {
      options.onSuccess({ ok: true, message: 'ok' });
    });
    setupMutation(mutate);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<LogNewClient />);
    await completeWizard(user);
    await user.click(screen.getByRole('button', { name: '送信する' }));

    expect(screen.getByText('記録しました。次回の分析対象に追加されました。')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();
    expect(screen.getByLabelText('いま、どのような障害に向き合っていますか？')).toHaveValue('');
  });

  it('keeps the confirmation input visible when mutation fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mutate = jest.fn((_payload, options) => {
      options.onError(new Error('送信失敗'));
    });
    setupMutation(mutate);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<LogNewClient />);
    await completeWizard(user);
    await user.click(screen.getByRole('button', { name: '送信する' }));

    expect(screen.getByText('エラー: 送信失敗')).toBeInTheDocument();
    expect(screen.getByText('Step 3 / 3')).toBeInTheDocument();
    expect(screen.getByText('上司に相談する')).toBeInTheDocument();
    expect(screen.getByText('メールした')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
