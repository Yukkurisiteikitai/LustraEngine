import { Experience } from '@/core/domains/experience/Experience';
import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IClusterCommandRepository } from '@/core/domains/cluster/IClusterCommandRepository';
import type { IPsychologyRepository } from '@/core/ports/IPsychologyRepository';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { ILoggerPort } from '@/application/ports/ILoggerPort';
import type { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import type { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import type { AnalysisContext } from '@/application/analysis/AnalysisContextService';
import {
  PATTERN_SYSTEM_PROMPT,
  buildPatternUserMessage,
  PATTERN_CLUSTER_LABELS,
} from '@/application/llm/patternDetectionPrompt';
import type { ClusterAssignment, ClusterType } from '@/types';

export class DetectPatternsUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly clusterCommand: IClusterCommandRepository,
    private readonly llm: ILLMPort,
    private readonly logger: ILoggerPort,
    private readonly retry: LLMRetryPolicy,
    private readonly validator: LLMResponseValidator,
    private readonly psychologyRepo: IPsychologyRepository,
  ) {}

  async execute(
    userId: string,
    context?: AnalysisContext,
    options?: { dryRun?: boolean; strict?: boolean },
  ): Promise<{ classified: number }> {
    // If context is provided (from AnalysisJobConsumer), use context.recentLogs
    // Otherwise, use traditional findUnclassified() for backward compatibility
    let targets: ExperienceData[];
    const dryRun = options?.dryRun ?? false;
    const strict = options?.strict ?? false;

    if (context?.recentLogs && context.recentLogs.length > 0) {
      // Convert context logs to experience data format
      targets = context.recentLogs.map((log) => ({
        id: log.id,
        userId,
        description: log.description,
        stressLevel: log.stressLevel,
        reportDifficulty: 3,
        careful: false,
        actionResult: 'CONFRONTED_SUCCESS',
        visibility: 'analysis_allowed',
        domainKey: String(log.domain),
        date: log.loggedAt,
      }));
    } else {
      // Backward compatibility: fetch unclassified
      targets = await this.expRepo.findUnclassified(userId, { visibility: 'analysis_allowed' });
    }

    let classified = 0;

    for (const expData of targets) {
      const experience = new Experience(expData);
      const userMessage = buildPatternUserMessage(experience);

      let raw: string;
      try {
        const { text } = await this.retry.execute(() =>
          this.llm.generate(PATTERN_SYSTEM_PROMPT, userMessage, 800),
        );
        raw = text;
      } catch (err) {
        this.logger.warn('detect:llm_failed', { experienceId: expData.id, err });
        continue;
      }

      const parsed = this.validator.validatePatternResponse(raw);

      if (!dryRun && parsed?.psychologyAnalysis) {
        try {
          await this.psychologyRepo.updateExperiencePsychologyAnalysis(
            expData.id as string,
            parsed.psychologyAnalysis,
          );
        } catch (err) {
          this.logger.error('detect:psychology_failed', { experienceId: expData.id, err });
        }
      }

      if (!parsed || parsed.assignments.length === 0) continue;

      const assignments: ClusterAssignment[] = parsed.assignments.map((a) => ({
        ...a,
        label: a.label ?? PATTERN_CLUSTER_LABELS[a.clusterType as ClusterType] ?? a.clusterType,
      }));

      if (!dryRun) {
        try {
          await this.clusterCommand.classifyExperienceAtomic(expData.id as string, assignments);
        } catch (err) {
          this.logger.error('detect:atomic_failed', { experienceId: expData.id, err });
          if (strict) throw err;
          continue;
        }
      }

      classified++;
    }

    return { classified };
  }
}
