import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';
import { LLMError } from '@/core/errors/LLMError';
import { logger } from '@/infrastructure/observability/logger';

const MODEL = 'claude-haiku-4-5-20251001';

export class ClaudeAdapter implements ILLMPort {
  constructor(private readonly apiKey: string) {}

  async generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        logger.error('llm:claude_rate_limited', {
          layer: 'ClaudeAdapter',
          status: 429,
          model: MODEL,
          retryAfter,
          body,
        });
      } else {
        logger.error('llm:claude_api_error', {
          layer: 'ClaudeAdapter',
          status: res.status,
          model: MODEL,
          body,
        });
      }
      throw new LLMError(`Claude API error ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: json.content.find((c) => c.type === 'text')?.text ?? '',
      tokenCount: json.usage.input_tokens + json.usage.output_tokens,
      modelName: json.model,
    };
  }
}
