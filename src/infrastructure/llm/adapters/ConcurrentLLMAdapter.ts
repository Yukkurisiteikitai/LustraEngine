import pLimit from 'p-limit';
import type { ILLMPort, LLMResult } from '@/application/ports/ILLMPort';
import { LLMConcurrencyError } from '@/core/errors/LLMConcurrencyError';
import { logger } from '@/infrastructure/observability/logger';

const MAX_CONCURRENT = parseInt(process.env.LLM_MAX_CONCURRENT ?? '3', 10);
const globalLimiter = pLimit(MAX_CONCURRENT);

export class ConcurrentLLMAdapter implements ILLMPort {
  constructor(
    private readonly inner: ILLMPort,
    private readonly opts: { waitForSlot: boolean; endpoint?: string },
  ) {}

  async generate(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<LLMResult> {
    const { waitForSlot, endpoint = 'unknown' } = this.opts;

    if (!waitForSlot && globalLimiter.activeCount >= MAX_CONCURRENT) {
      logger.warn('llm:concurrency_exhausted', {
        layer: 'ConcurrentLLMAdapter',
        endpoint,
        activeCount: globalLimiter.activeCount,
        maxConcurrency: MAX_CONCURRENT,
      });
      throw new LLMConcurrencyError(
        'LLMサーバーが混雑しています。しばらくしてから再試行してください。',
        { endpoint, activeCount: globalLimiter.activeCount, maxConcurrency: MAX_CONCURRENT },
      );
    }

    try {
      return await globalLimiter(() => this.inner.generate(systemPrompt, userMessage, maxTokens));
    } catch (err) {
      logger.error('llm:generate_failed', {
        layer: 'ConcurrentLLMAdapter',
        operation: 'generate',
        endpoint,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  }
}
