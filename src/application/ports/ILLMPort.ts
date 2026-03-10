export interface LLMResult {
  text: string;
  tokenCount: number;
  modelName: string;
}

export interface ILLMPort {
  generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult>;
}
