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

describe('persona UI wording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the model summary wording instead of personality assertions', async () => {
    const findActiveByUser = jest.fn().mockResolvedValue([
      {
        id: 'th-1',
        userId: 'user-1',
        traitKey: 'discipline',
        hypothesisLabel: 'medium',
        hypothesisText: '現時点のログ上、自律性は中程度という仮説があります。',
        score: 0.5,
        confidence: 0.8,
        uncertainty: 0.2,
        evidenceIds: ['exp-1'],
        sourcePatternIds: [],
        modelName: 'model-a',
        modelVersion: '1',
        promptVersion: 'v004',
        status: 'active',
        supersedesHypothesisId: null,
        supersededByHypothesisId: null,
        analysisJobId: null,
        createdAt: '2026-05-14T00:00:00.000Z',
      },
    ]);

    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    });
    mockCreateRepositories.mockReturnValue({
      traitHypothesis: { findActiveByUser },
    });

    render(await PersonaPage());

    expect(screen.getByRole('heading', { name: 'ユーザーモデル' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '現在の仮説要約' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'モデル要約' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '仮説を更新' })).toBeInTheDocument();
    expect(screen.getByText(/現在の仮説は 1 件あります/)).toBeInTheDocument();
    expect(screen.getByText(/自律性は中程度/)).toBeInTheDocument();
    expect(screen.queryByText(/あなたは/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ペルソナ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/人格/)).not.toBeInTheDocument();
    expect(screen.queryByText(/性格/)).not.toBeInTheDocument();
    expect(screen.queryByText(/診断/)).not.toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
