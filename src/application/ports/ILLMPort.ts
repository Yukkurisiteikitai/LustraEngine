export type TokenUsage = {
  total: number;
  input?: number;
  output?: number;
};

export interface LLMResult {
  text: string;
  tokenUsage: TokenUsage | undefined;
  modelName: string;
}

export interface ILLMPort {
  generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult>;
}
