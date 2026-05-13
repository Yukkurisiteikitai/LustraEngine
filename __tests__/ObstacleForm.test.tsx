import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ObstacleForm from '@/components/ObstacleForm';

describe('ObstacleForm', () => {
  it('validates required fields before submit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<ObstacleForm onSubmit={onSubmit} submitLabel="次へ" />);

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByText('内容を入力してください')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('いま、どのような障害に向き合っていますか？'), '会議で発言するのが怖い');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByText('領域を選択してください')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
