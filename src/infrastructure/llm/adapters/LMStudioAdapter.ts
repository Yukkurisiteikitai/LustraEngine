import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';
import { LLMError } from '@/core/errors/LLMError';
import { logger } from '@/infrastructure/observability/logger';

export class LMStudioAdapter implements ILLMPort {
  private readonly endpoint: string;

  constructor(
    endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async *generateStream(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): AsyncGenerator<string> {
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
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new LLMError(`LM Studio streaming API error ${res.status}: ${text}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
          };
          const chunk = json.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  }

  async generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult> {
    const t0 = Date.now();

    logger.info('llm:lmstudio_generate_start', {
      layer: 'LMStudioAdapter',
      model: this.model,
      maxTokens,
      systemPromptChars: systemPrompt.length,
      userMessageChars: userMessage.length,
    });

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

    const ttfbMs = Date.now() - t0;

    if (!res.ok) {
      const text = await res.text();
      logger.error('llm:lmstudio_api_error', {
        layer: 'LMStudioAdapter',
        status: res.status,
        model: this.model,
        ttfbMs,
        responseBody: text.slice(0, 500),
      });
      throw new LLMError(`LM Studio API error ${res.status}: ${text}`);
    }

    // LM Studio follows OpenAI format: prompt_tokens / completion_tokens / total_tokens
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        // some builds use Anthropic-style names
        input_tokens?: number;
        output_tokens?: number;
      };
    };
    const totalMs = Date.now() - t0;
    const u = json.usage;
    const inputTokens = u?.input_tokens ?? u?.prompt_tokens;
    const outputTokens = u?.output_tokens ?? u?.completion_tokens;
    const totalTokens = u?.total_tokens ?? (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : undefined);

    logger.info('llm:lmstudio_generate_success', {
      layer: 'LMStudioAdapter',
      model: json.model ?? this.model,
      ttfbMs,
      totalMs,
      inputTokens,
      outputTokens,
      totalTokens: totalTokens ?? '(not reported)',
    });

    return {
      text: json.choices[0]?.message?.content ?? '',
      // Rate limiting is skipped for local LLM — tokenUsage is informational only.
      tokenUsage: totalTokens != null ? { total: totalTokens, input: inputTokens, output: outputTokens } : undefined,
      modelName: json.model ?? this.model,
    };
  }
}
