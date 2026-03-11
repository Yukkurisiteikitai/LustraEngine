import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';
import { LLMError } from '@/core/errors/LLMError';

export class LMStudioAdapter implements ILLMPort {
  private readonly endpoint: string;

  constructor(
    endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult> {
    const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new LLMError(`LM Studio API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model?: string;
      usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
    };
    const u = json.usage;
    const tokenUsage = u != null
      ? {
          total: u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
          input: u.input_tokens,
          output: u.output_tokens,
        }
      : undefined;
    return {
      text: json.choices[0]?.message?.content ?? '',
      tokenUsage,
      modelName: json.model ?? this.model,
    };
  }
}
