import type { ILLMPort } from '@/application/ports/ILLMPort';
import {
  LLMResponseValidator,
  type StructuredDiaryResponse,
} from '@/application/llm/policies/LLMResponseValidator';
import {
  STRUCTURED_DIARY_SYSTEM_PROMPT,
  buildStructuredDiaryUserMessage,
} from '@/application/llm/structuredDiaryPrompt';
import { LLMExtractionFailedError } from '@/core/errors/LLMExtractionFailedError';
import { ValidationError } from '@/core/errors/ValidationError';

const MIN_DIARY_LENGTH = 4;
const MAX_DIARY_LENGTH = 2000;
const RESPONSE_MAX_TOKENS = 800;

export interface ExtractStructuredDiaryInput {
  diaryText: string;
}

export interface ExtractStructuredDiaryResult extends StructuredDiaryResponse {
  modelName: string;
  rawText: string;
}

export class ExtractStructuredDiaryUseCase {
  constructor(
    private readonly llm: ILLMPort,
    private readonly validator: LLMResponseValidator = new LLMResponseValidator(),
  ) {}

  async execute(input: ExtractStructuredDiaryInput): Promise<ExtractStructuredDiaryResult> {
    const text = (input.diaryText ?? '').trim();
    if (text.length < MIN_DIARY_LENGTH) {
      throw new ValidationError('日記テキストが短すぎます');
    }
    if (text.length > MAX_DIARY_LENGTH) {
      throw new ValidationError(`日記テキストは${MAX_DIARY_LENGTH}文字以内で入力してください`);
    }

    const userMessage = buildStructuredDiaryUserMessage(text);
    const result = await this.llm.generate(
      STRUCTURED_DIARY_SYSTEM_PROMPT,
      userMessage,
      RESPONSE_MAX_TOKENS,
    );

    const parsed = this.validator.validateStructuredDiaryResponse(result.text);
    if (!parsed) {
      // No silent fallback. The caller must surface this to the user and let
      // them retry / fall back to manual entry. This is the deliberate inverse
      // of the eb63919 chat fallback bug.
      throw new LLMExtractionFailedError(
        'LLM-1 が日記を構造化できませんでした。プロンプトかモデルの応答を確認してください。',
        { rawText: result.text?.slice(0, 500), modelName: result.modelName },
      );
    }

    return { ...parsed, modelName: result.modelName, rawText: result.text };
  }
}
