import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LogNewClient from '@/app/log/new/LogNewClient';
import {
  useExtractDiaryMutation,
  useSubmitLogMutation,
  type ExtractedDiaryFields,
} from '@/lib/mockQueryClient';

jest.mock('@/lib/mockQueryClient', () => ({
  useExtractDiaryMutation: jest.fn(),
  useSubmitLogMutation: jest.fn(),
}));

const mockUseExtract = useExtractDiaryMutation as jest.Mock;
const mockUseSubmit = useSubmitLogMutation as jest.Mock;

function setupExtract(mutate: jest.Mock) {
  mockUseExtract.mockReturnValue({ mutate, isPending: false });
}
function setupSubmit(mutate: jest.Mock) {
  mockUseSubmit.mockReturnValue({ mutate, isPending: false });
}

const SAMPLE_EXTRACTED: ExtractedDiaryFields = {
  description: 'スタバで国語のレポートを2件完了',
  context: 'スタバ',
  timeOfDay: 'afternoon',
  durationMinutes: 120,
  emotions: [
    { label: '爽快', intensity: 4 },
    { label: '達成感', intensity: 4 },
  ],
  actionResult: 'CONFRONTED_SUCCESS',
  trigger: '550円分は回収してやるという気持ち',
  needsTriggerQuestion: false,
  triggerQuestion: null,
  modelName: 'qwen3-swallow-8b-rl-v0.2',
};

describe('LogNewClient (3-step diary → confirm → save flow)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-14T00:00:00.000Z'));
    jest.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('extracts diary then saves a structured payload', async () => {
    const extractMutate = jest.fn((_text: string, opts: { onSuccess: (r: ExtractedDiaryFields) => void }) => {
      opts.onSuccess(SAMPLE_EXTRACTED);
    });
    const saveMutate = jest.fn();
    setupExtract(extractMutate);
    setupSubmit(saveMutate);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LogNewClient />);

    // Step 1: type diary, click extract
    const textarea = screen.getByPlaceholderText(/スタバで2時間レポート/);
    await user.type(textarea, '今日は集中して取り組めた。レポートが終わって嬉しい。');
    await user.click(screen.getByRole('button', { name: /AIに読み取ってもらう/ }));

    expect(extractMutate).toHaveBeenCalledTimes(1);
    expect(extractMutate.mock.calls[0][0]).toContain('今日は集中して');

    // Step 2: confirm step renders extracted fields
    expect(await screen.findByDisplayValue('スタバで国語のレポートを2件完了')).toBeInTheDocument();
    expect(screen.getByDisplayValue('スタバ')).toBeInTheDocument();
    expect(screen.getByText('爽快')).toBeInTheDocument();

    // Pick a domain (the LLM cannot infer this), then save
    await user.click(screen.getByRole('button', { name: '仕事' }));
    await user.click(screen.getByRole('button', { name: /保存する/ }));

    expect(saveMutate).toHaveBeenCalledTimes(1);
    const payload = saveMutate.mock.calls[0][0];
    expect(payload.date).toBe('2026-06-14');
    expect(payload.obstacles).toHaveLength(1);
    const ob = payload.obstacles[0];
    expect(ob.actionResult).toBe('CONFRONTED_SUCCESS');
    expect(ob.timeOfDay).toBe('afternoon');
    expect(ob.durationMinutes).toBe(120);
    expect(ob.domain).toBe('WORK');
    expect(ob.emotions).toEqual([
      { label: '爽快', intensity: 4 },
      { label: '達成感', intensity: 4 },
    ]);
    expect(ob.trigger).toBe('550円分は回収してやるという気持ち');
  });

  it('shows the trigger follow-up only when needsTriggerQuestion is true', async () => {
    const extractMutate = jest.fn((_text: string, opts: { onSuccess: (r: ExtractedDiaryFields) => void }) => {
      opts.onSuccess({
        ...SAMPLE_EXTRACTED,
        trigger: null,
        needsTriggerQuestion: true,
        triggerQuestion: 'なぜ取りかかれたのですか？',
      });
    });
    const saveMutate = jest.fn();
    setupExtract(extractMutate);
    setupSubmit(saveMutate);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LogNewClient />);

    await user.type(screen.getByPlaceholderText(/スタバで2時間レポート/), '夕方ジムに行った。');
    await user.click(screen.getByRole('button', { name: /AIに読み取ってもらう/ }));

    await screen.findByDisplayValue('スタバで国語のレポートを2件完了');
    await user.click(screen.getByRole('button', { name: '仕事' }));
    await user.click(screen.getByRole('button', { name: /次へ/ }));

    expect(await screen.findByText('なぜ取りかかれたのですか？')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('思い当たることを一言で…'), '体が動いた');
    await user.click(screen.getByRole('button', { name: /保存する/ }));

    expect(saveMutate).toHaveBeenCalledTimes(1);
    expect(saveMutate.mock.calls[0][0].obstacles[0].trigger).toBe('体が動いた');
  });

  it('surfaces extraction errors and keeps the user on step 1', async () => {
    const extractMutate = jest.fn((_text: string, opts: { onError: (e: Error) => void }) => {
      opts.onError(new Error('LLMが落ちました'));
    });
    setupExtract(extractMutate);
    setupSubmit(jest.fn());

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LogNewClient />);

    await user.type(screen.getByPlaceholderText(/スタバで2時間レポート/), 'テスト日記です。');
    await user.click(screen.getByRole('button', { name: /AIに読み取ってもらう/ }));

    await waitFor(() => {
      // error message renders in both the inline error box and the aria-live region
      expect(screen.getAllByText('LLMが落ちました').length).toBeGreaterThan(0);
    });
    // Still on step 1
    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();
  });
});
