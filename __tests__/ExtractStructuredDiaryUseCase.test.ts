import { ExtractStructuredDiaryUseCase } from '@/application/usecases/ExtractStructuredDiaryUseCase';
import { LLMExtractionFailedError } from '@/core/errors/LLMExtractionFailedError';
import { ValidationError } from '@/core/errors/ValidationError';
import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';

function fakeLLM(text: string): ILLMPort {
  return {
    generate: jest.fn(async (): Promise<LLMResult> => ({
      text,
      tokenUsage: { total: 100, input: 60, output: 40 },
      modelName: 'qwen3-swallow-8b-rl-v0.2',
    })),
  };
}

const VALID_JSON = JSON.stringify({
  description: 'スタバでレポートを完了',
  context: 'スタバ',
  time_of_day: 'afternoon',
  duration_minutes: 90,
  emotions: [{ label: '達成感', intensity: 4 }],
  action_result: 'CONFRONTED_SUCCESS',
  trigger: null,
  needs_trigger_question: true,
  trigger_question: 'なぜ取りかかれたのですか？',
});

describe('ExtractStructuredDiaryUseCase', () => {
  it('returns a typed structured response on success', async () => {
    const useCase = new ExtractStructuredDiaryUseCase(fakeLLM(VALID_JSON));
    const result = await useCase.execute({
      diaryText: 'スタバで2時間レポートをやった。集中できて達成感あり。',
    });
    expect(result.description).toBe('スタバでレポートを完了');
    expect(result.actionResult).toBe('CONFRONTED_SUCCESS');
    expect(result.modelName).toBe('qwen3-swallow-8b-rl-v0.2');
    expect(result.needsTriggerQuestion).toBe(true);
  });

  it('strips ```json fences before validating', async () => {
    const useCase = new ExtractStructuredDiaryUseCase(
      fakeLLM('```json\n' + VALID_JSON + '\n```'),
    );
    const result = await useCase.execute({
      diaryText: 'スタバで2時間レポート完了。',
    });
    expect(result.actionResult).toBe('CONFRONTED_SUCCESS');
  });

  it('throws LLMExtractionFailedError when the LLM returns non-JSON (NO silent fallback)', async () => {
    const useCase = new ExtractStructuredDiaryUseCase(
      fakeLLM('申し訳ありません、テンプレを返します。'),
    );
    await expect(
      useCase.execute({ diaryText: 'なんでもいいから入力する' }),
    ).rejects.toBeInstanceOf(LLMExtractionFailedError);
  });

  it('throws ValidationError when diary text is too short', async () => {
    const useCase = new ExtractStructuredDiaryUseCase(fakeLLM(VALID_JSON));
    await expect(useCase.execute({ diaryText: 'a' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when diary text exceeds the limit', async () => {
    const useCase = new ExtractStructuredDiaryUseCase(fakeLLM(VALID_JSON));
    await expect(
      useCase.execute({ diaryText: 'あ'.repeat(2001) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
