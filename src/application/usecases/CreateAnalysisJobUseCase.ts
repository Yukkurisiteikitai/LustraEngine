import type { IAnalysisJobRepository } from '@/core/domains/analysis/IAnalysisJobRepository';
import type { CreateAnalysisJobInput } from '@/core/domains/analysis/AnalysisJob';
import { ValidationError } from '@/core/errors/ValidationError';

export class CreateAnalysisJobUseCase {
  constructor(private readonly analysisJobRepository: IAnalysisJobRepository) {}

  async execute(userId: string, input: CreateAnalysisJobInput): Promise<string> {
    // Validate mode
    const validModes = ['quick', 'full_3months'];
    if (!validModes.includes(input.mode)) {
      throw new ValidationError('Mode must be quick or full_3months');
    }

    // Generate idempotency key
    const today = new Date().toISOString().split('T')[0];
    const idempotencyKey = `analysis:${userId}:manual:${input.mode}:${today}`;

    // Create or get active job
    const job = await this.analysisJobRepository.createOrGetActive(
      userId,
      input,
      'manual',
      idempotencyKey,
    );

    return job.id;
  }
}
