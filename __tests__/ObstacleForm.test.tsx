import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ObstacleForm from '@/components/ObstacleForm';

describe('ObstacleForm', () => {
  it('required fields are validated before submit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<ObstacleForm onSubmit={onSubmit} submitLabel="次へ" />);

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByText('障害の内容を入力してください')).toBeInTheDocument();
    expect(screen.getByText('領域を選択してください')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
