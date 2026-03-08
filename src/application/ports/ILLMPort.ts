export interface ILLMPort {
  generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<string>;
}
