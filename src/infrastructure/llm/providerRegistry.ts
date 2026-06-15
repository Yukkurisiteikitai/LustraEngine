import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';
import type { LMConfig, LLMProvider, LLMProviderType } from '@/types';
import { logger } from '@/infrastructure/observability/logger';

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LLMGenerateInput = {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
};

export type LLMGenerateResult = {
  text: string;
  raw?: unknown;
};

export interface WorkerLLMClient {
  generate(input: LLMGenerateInput): Promise<LLMGenerateResult>;
}

export interface ResolvedLLMConfig {
  provider: LLMProvider;
  type: LLMProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function hasPublicHostPrefix(hostname: string): boolean {
  return /^localhost$/i.test(hostname) ||
    /^127\./.test(hostname) ||
    /^0\.0\.0\.0$/.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname === '::1';
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

export function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith('/messages')) {
    return normalized;
  }
  return `${normalized}/messages`;
}

function assertWorkerBaseUrlAllowed(baseUrl: string, appEnv: string | undefined): void {
  if (appEnv !== 'production') return;

  try {
    const url = new URL(baseUrl);
    if (hasPublicHostPrefix(url.hostname)) {
      throw new Error(`Invalid production LLM baseUrl host: ${url.hostname}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid production LLM baseUrl host')) {
      throw error;
    }
    throw new Error(`[llm] Invalid baseUrl: ${baseUrl}`);
  }
}

function getAppEnv(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env.APP_ENV;
}

function resolveProviderType(provider: LLMProvider): LLMProviderType {
  switch (provider) {
    case 'anthropic':
      return 'claude';
    case 'gemini':
      return 'gemini';
    default:
      return 'gpt';
  }
}

export function normalizeLLMConfig(config: LMConfig): ResolvedLLMConfig {
  if (config.provider === 'lmstudio') {
    const baseUrl = config.lmstudioEndpoint ?? config.baseUrl ?? 'http://localhost:1234/v1';
    return {
      provider: 'custom_openai_compatible',
      type: 'gpt',
      model: config.lmstudioModel ?? config.model ?? 'local-model',
      apiKey: config.lmstudioApiKey || config.apiKey || 'lm-studio',
      baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };
  }

  if (config.provider === 'claude') {
    return {
      provider: 'anthropic',
      type: 'claude',
      model: config.model ?? 'claude-haiku-4-5-20251001',
      apiKey: config.claudeApiKey ?? config.apiKey ?? '',
      baseUrl: config.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };
  }

  const provider = config.provider as LLMProvider;
  const type = config.type ?? resolveProviderType(provider);

  const baseUrl =
    config.baseUrl ??
    (provider === 'openai'
      ? DEFAULT_OPENAI_BASE_URL
      : provider === 'deepseek'
        ? DEFAULT_DEEPSEEK_BASE_URL
        : provider === 'gemini'
          ? DEFAULT_GEMINI_BASE_URL
          : undefined);

  return {
    provider,
    type,
    model: config.model ?? (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'),
    apiKey: config.apiKey ?? config.lmstudioApiKey ?? config.claudeApiKey ?? '',
    baseUrl,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

export function validateLLMConfig(config: LMConfig): ResolvedLLMConfig {
  const resolved = normalizeLLMConfig(config);

  if (config.provider === 'custom_openai_compatible' && resolved.type !== 'gpt') {
    throw new Error('custom_openai_compatible only supports type=gpt');
  }

  if ((resolved.provider === 'anthropic' || resolved.provider === 'openai' || resolved.provider === 'deepseek' || resolved.provider === 'custom_openai_compatible') && !resolved.apiKey) {
    throw new Error(`LLM apiKey is required for provider ${resolved.provider}`);
  }

  if (config.provider === 'custom_openai_compatible' && !config.baseUrl) {
    throw new Error('custom_openai_compatible requires baseUrl');
  }

  if (resolved.baseUrl) {
    assertWorkerBaseUrlAllowed(resolved.baseUrl, getAppEnv());
  }

  return resolved;
}

export function resolveWorkerLLMConfigFromEnv(env: CloudflareEnv): ResolvedLLMConfig {
  const provider = (env.LLM_PROVIDER ?? 'custom_openai_compatible') as LLMProvider;
  const type = (env.LLM_TYPE ?? 'gpt') as LLMProviderType;
  const model = env.LLM_MODEL ?? 'gpt-4o-mini';
  const apiKey = env.LLM_API_KEY ?? '';
  const baseUrl = env.LLM_BASE_URL ?? 'http://localhost:1234/v1';

  if (provider === 'custom_openai_compatible' && type !== 'gpt') {
    throw new Error('custom_openai_compatible only supports type=gpt');
  }

  assertWorkerBaseUrlAllowed(baseUrl, env.APP_ENV);

  return {
    provider,
    type,
    model,
    apiKey,
    baseUrl,
    temperature: undefined,
    maxTokens: undefined,
  };
}

function resolveFetchOptions(input: LLMGenerateInput, config: ResolvedLLMConfig) {
  // Disable Qwen3 (and similar reasoning models) thinking on LM Studio.
  // Without this, qwen3-swallow consumed the entire max_tokens budget
  // (1024/1024 reasoning_tokens observed) and emitted empty content.
  // `/no_think` in the prompt was not honored by this build's chat template.
  // Other servers behind custom_openai_compatible typically ignore unknown fields.
  const chatTemplateKwargs =
    config.provider === 'custom_openai_compatible'
      ? { chat_template_kwargs: { enable_thinking: false } }
      : {};

  return {
    model: config.model,
    messages: input.messages,
    temperature: input.temperature ?? config.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? config.maxTokens ?? 1024,
    response_format:
      input.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    ...chatTemplateKwargs,
  };
}

export function createOpenAICompatibleClient(config: ResolvedLLMConfig, timeoutMs = 60_000): WorkerLLMClient {
  if (!config.baseUrl) {
    throw new Error(`[llm] Missing baseUrl for provider ${config.provider}`);
  }

  assertWorkerBaseUrlAllowed(config.baseUrl, getAppEnv());

  return {
    async generate(input: LLMGenerateInput): Promise<LLMGenerateResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(buildChatCompletionsUrl(config.baseUrl!), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(resolveFetchOptions(input, config)),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`LLM request failed: ${res.status} ${errorText}`);
        }

        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const choice = data.choices?.[0];
        const text = choice?.message?.content;
        const finishReason = choice?.finish_reason ?? 'unknown';

        if (!text) {
          logger.warn('llm:response_empty', {
            layer: 'providerRegistry',
            provider: config.provider,
            model: config.model,
            finishReason,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
          });
          throw new Error(`LLM response was empty (finish_reason: ${finishReason})`);
        }

        // finish_reason=length はコンテキストウィンドウ枯渇またはmax_tokens到達を示す
        if (finishReason === 'length') {
          logger.warn('llm:response_truncated', {
            layer: 'providerRegistry',
            provider: config.provider,
            model: config.model,
            finishReason,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
            totalTokens: data.usage?.total_tokens,
          });
        }

        return { text, raw: data };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createAnthropicClient(config: ResolvedLLMConfig, timeoutMs = 60_000): WorkerLLMClient {
  if (!config.baseUrl) {
    throw new Error('[llm] Missing baseUrl for anthropic provider');
  }

  return {
    async generate(input: LLMGenerateInput): Promise<LLMGenerateResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const system = input.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
        const userMessages = input.messages.filter((message) => message.role !== 'system');
        const res = await fetch(buildAnthropicMessagesUrl(config.baseUrl!), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: input.maxTokens ?? config.maxTokens ?? 1024,
            system: system || undefined,
            messages: userMessages,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Anthropic request failed: ${res.status} ${errorText}`);
        }

        const data = await res.json() as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const text = data.content?.find((item) => item.type === 'text')?.text;
        if (!text) {
          throw new Error('Anthropic response was empty');
        }

        return { text, raw: data };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createUnsupportedProviderClient(provider: string): WorkerLLMClient {
  return {
    async generate(): Promise<LLMGenerateResult> {
      throw new Error(`Provider ${provider} is not implemented in worker runtime yet`);
    },
  };
}

export function toILLMPort(client: WorkerLLMClient): ILLMPort {
  return {
    async generate(systemPrompt: string, userMessage: string, maxTokens: number): Promise<LLMResult> {
      const result = await client.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        maxTokens,
      });

      return {
        text: result.text,
        tokenUsage: undefined,
        modelName: 'worker-llm',
      };
    },
  };
}