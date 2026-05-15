import { render, screen } from '@testing-library/react';
import PersonaPage from '@/app/persona/page';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
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

jest.mock('@/app/persona/TraitInferButton', () => function MockTraitInferButton() {
  return <button type="button">仮説を更新</button>;
});

const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.Mock;
const mockCreateRepositories = createRepositories as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

describe('persona page fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an empty summary and warning when active hypotheses cannot be loaded', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      traitHypothesis: {
        findActiveByUser: jest.fn().mockRejectedValue(new Error('db unavailable')),
      },
    });

    render(await PersonaPage());

    expect(screen.getByRole('heading', { name: 'ユーザーモデル' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '現在の仮説要約' })).toBeInTheDocument();
    expect(screen.getByText(/仮説要約の読み込みに失敗しました/)).toBeInTheDocument();
    expect(screen.getByText(/まだ仮説は少なめです/)).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
