import type { SupabaseClient } from '@supabase/supabase-js';
import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { AnalysisQueueMessage } from '@/cloudflare-env';
import { AnalysisContextService } from '@/application/analysis/AnalysisContextService';
import { DetectPatternsUseCase } from '@/application/usecases/DetectPatternsUseCase';
import { InferTraitsUseCase } from '@/application/usecases/InferTraitsUseCase';
import { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import { logger } from '@/infrastructure/observability/logger';
import type { TraitHypothesisResult } from '@/core/domains/trait/TraitHypothesis';

/**
 * Processes analysis jobs from the Cloudflare Queue
 * Uses service role for database access (no RLS)
 */
export class AnalysisJobConsumer {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly experienceRepo: IExperienceRepository,
    private readonly clusterCommandRepo: any,
    private readonly clusterQueryRepo: any,
    private readonly traitHypothesisRepo: any,
    private readonly psychologyRepo: any,
    private readonly createLlm: (userId: string) => Promise<ILLMPort>,
  ) {}

  async process(message: AnalysisQueueMessage): Promise<void> {
    const { jobId, userId, trigger, mode } = message;

    try {
      logger.info(`[AnalysisJobConsumer] Processing job ${jobId} for user ${userId} (${mode})`);

      // Step 1: CAS - transition job from pending to running
      const { data: updatedJob, error: updateError } = await this.supabase
        .from('analysis_jobs')
        .update({
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('status', 'pending')
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError || !updatedJob) {
        logger.warn(`[AnalysisJobConsumer] CAS failed for job ${jobId}, likely already processed`);
        return;
      }

      // Step 2: Build analysis context
      const contextService = new AnalysisContextService(
        this.supabase,
        this.experienceRepo,
        this.traitHypothesisRepo,
      );
      const context = await contextService.buildContext(userId, mode);
      const llm = await this.createLlm(userId);

      // Step 3: Run detect patterns
      logger.info(`[AnalysisJobConsumer] Running DetectPatterns for job ${jobId}`);
      const detectUseCase = new DetectPatternsUseCase(
        this.experienceRepo,
        this.clusterCommandRepo,
        llm,
        logger,
        new LLMRetryPolicy(),
        new LLMResponseValidator(),
        this.psychologyRepo,
      );
      const detectResult = await detectUseCase.execute(userId, context, {
        dryRun: mode === 'quick',
        strict: true,
      });
      logger.info(`[AnalysisJobConsumer] DetectPatterns completed: ${detectResult.classified} classified`);

      // Step 4: Run infer traits (if not quick mode)
      let inferResult: TraitHypothesisResult | null = null;
      if (mode !== 'quick') {
        logger.info(`[AnalysisJobConsumer] Running InferTraits for job ${jobId}`);
        const inferUseCase = new InferTraitsUseCase(
          this.experienceRepo,
          this.clusterQueryRepo,
          this.traitHypothesisRepo,
          llm,
          logger,
          new LLMRetryPolicy(),
          new LLMResponseValidator(),
        );
        inferResult = await inferUseCase.execute(userId, context, { strict: true });
        logger.info(`[AnalysisJobConsumer] InferTraits completed`);
      }

      // Step 5: Update processed_at for unprocessed logs (if daily or full_3months)
      if (mode !== 'quick') {
        const unprocessedIds = context.unprocessedLogs.map((log) => log.id);
        if (unprocessedIds.length > 0) {
          const { error: updateProcessedError } = await this.supabase
            .from('experiences')
            .update({ processed_at: new Date().toISOString() })
            .in('id', unprocessedIds)
            .eq('user_id', userId);

          if (updateProcessedError) {
            logger.error(
              `[AnalysisJobConsumer] Failed to update processed_at: ${updateProcessedError.message}`,
            );
          }
        }
      }

      // Step 6: Mark job as completed
      const { error: completeError } = await this.supabase
        .from('analysis_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: {
            mode,
            trigger,
            processedCount: context.unprocessedLogs.length,
            detectResult: {
              classified: detectResult.classified,
            },
            inferResult: inferResult
              ? {
                  hypothesesGenerated: inferResult.summary.generatedCount,
                  evidenceCount: inferResult.summary.evidenceCount,
                }
              : null,
          },
        })
        .eq('id', jobId)
        .eq('user_id', userId);

      if (completeError) {
        logger.error(
          `[AnalysisJobConsumer] Failed to mark job as completed: ${completeError.message}`,
        );
      }

      logger.info(`[AnalysisJobConsumer] Job ${jobId} completed successfully`);
    } catch (error) {
      logger.error(`[AnalysisJobConsumer] Job ${jobId} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Mark job as failed
      const { error: failError } = await this.supabase
        .from('analysis_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : JSON.stringify(error),
        })
        .eq('id', jobId)
        .eq('user_id', userId);

      if (failError) {
        logger.error(`[AnalysisJobConsumer] Failed to mark job as failed: ${failError.message}`);
      }

      return; // Make application-level LLM failures terminal for the job
    }
  }
}
