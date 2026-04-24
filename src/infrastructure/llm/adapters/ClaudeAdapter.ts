import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';
import { LLMError } from '@/core/errors/LLMError';
import { logger } from '@/infrastructure/observability/logger';

const MODEL = 'claude-haiku-4-5-20251001';

function extractRateLimitHeaders(headers: Headers): Record<string, string | null> {
  return {
    'retry-after': headers.get('retry-after'),
    'x-ratelimit-limit-requests': headers.get('x-ratelimit-limit-requests'),
    'x-ratelimit-limit-tokens': headers.get('x-ratelimit-limit-tokens'),
    'x-ratelimit-remaining-requests': headers.get('x-ratelimit-remaining-requests'),
    'x-ratelimit-remaining-tokens': headers.get('x-ratelimit-remaining-tokens'),
    'x-ratelimit-reset-requests': headers.get('x-ratelimit-reset-requests'),
    'x-ratelimit-reset-tokens': headers.get('x-ratelimit-reset-tokens'),
    'anthropic-ratelimit-requests-limit': headers.get('anthropic-ratelimit-requests-limit'),
    'anthropic-ratelimit-requests-remaining': headers.get('anthropic-ratelimit-requests-remaining'),
    'anthropic-ratelimit-tokens-limit': headers.get('anthropic-ratelimit-tokens-limit'),
    'anthropic-ratelimit-tokens-remaining': headers.get('anthropic-ratelimit-tokens-remaining'),
    'anthropic-ratelimit-tokens-reset': headers.get('anthropic-ratelimit-tokens-reset'),
    'request-id': headers.get('request-id'),
  };
}

export class ClaudeAdapter implements ILLMPort {
  constructor(private readonly apiKey: string) {}

  async *generateStream(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): AsyncGenerator<string> {
    const t0 = Date.now();
    const systemLen = systemPrompt.length;
    const userLen = userMessage.length;

    logger.info('llm:claude_stream_start', {
      layer: 'ClaudeAdapter',
      model: MODEL,
      maxTokens,
      systemPromptChars: systemLen,
      userMessageChars: userLen,
    });

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
        stream: true,
      }),
    });

    const ttfb = Date.now() - t0;

    if (!res.ok) {
      const body = await res.text();
      const rateLimitHeaders = extractRateLimitHeaders(res.headers);
      logger.error('llm:claude_stream_error', {
        layer: 'ClaudeAdapter',
        status: res.status,
        model: MODEL,
        ttfbMs: ttfb,
        systemPromptChars: systemLen,
        userMessageChars: userLen,
        rateLimitHeaders,
        responseBody: body.slice(0, 1000),
      });
      throw new LLMError(`Claude streaming API error ${res.status}: ${body}`);
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
            type: string;
            delta?: { type: string; text?: string };
          };
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
            yield json.delta.text;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  }

  async generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult> {
    const t0 = Date.now();
    const systemLen = systemPrompt.length;
    const userLen = userMessage.length;

    logger.info('llm:claude_generate_start', {
      layer: 'ClaudeAdapter',
      model: MODEL,
      maxTokens,
      systemPromptChars: systemLen,
      userMessageChars: userLen,
    });

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

    const ttfbMs = Date.now() - t0;

    if (!res.ok) {
      const body = await res.text();
      const rateLimitHeaders = extractRateLimitHeaders(res.headers);
      if (res.status === 429) {
        logger.error('llm:claude_rate_limited', {
          layer: 'ClaudeAdapter',
          status: 429,
          model: MODEL,
          ttfbMs,
          systemPromptChars: systemLen,
          userMessageChars: userLen,
          rateLimitHeaders,
          responseBody: body.slice(0, 1000),
        });
      } else {
        logger.error('llm:claude_api_error', {
          layer: 'ClaudeAdapter',
          status: res.status,
          model: MODEL,
          ttfbMs,
          systemPromptChars: systemLen,
          userMessageChars: userLen,
          rateLimitHeaders,
          responseBody: body.slice(0, 1000),
        });
      }
      throw new LLMError(`Claude API error ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    const totalMs = Date.now() - t0;

    logger.info('llm:claude_generate_success', {
      layer: 'ClaudeAdapter',
      model: json.model,
      ttfbMs,
      totalMs,
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
    });

    return {
      text: json.content.find((c) => c.type === 'text')?.text ?? '',
      tokenUsage: {
        total: json.usage.input_tokens + json.usage.output_tokens,
        input: json.usage.input_tokens,
        output: json.usage.output_tokens,
      },
      modelName: json.model,
    };
  }
}
