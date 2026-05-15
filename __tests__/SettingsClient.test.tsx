import { render, screen, waitFor } from '@testing-library/react';
import SettingsClient from '@/app/settings/SettingsClient';

describe('SettingsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ setting: null }),
    }) as jest.Mock;
  });

  it('wraps password fields in a form when editable', async () => {
    render(<SettingsClient isProduction={false} llmSettingsEnabled={true} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument());
    const apiKeyInput = screen.getByLabelText('APIキー') as HTMLInputElement;
    expect(apiKeyInput).toHaveAttribute('type', 'password');
    expect(apiKeyInput.closest('form')).toBeTruthy();
  });

  it('shows a production notice without client-side env checks', async () => {
    render(<SettingsClient isProduction={true} llmSettingsEnabled={false} />);

    await waitFor(() =>
      expect(screen.getByText(/本番\/previewでは、ユーザー個別のLLM API key保存は現在無効です/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });
});
