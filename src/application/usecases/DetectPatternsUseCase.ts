import { Experience } from '@/core/domains/experience/Experience';
import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IClusterQueryRepository } from '@/core/domains/cluster/IClusterQueryRepository';
import type { IClusterCommandRepository } from '@/core/domains/cluster/IClusterCommandRepository';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import type { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import {
  PATTERN_SYSTEM_PROMPT,
  buildPatternUserMessage,
  PATTERN_CLUSTER_LABELS,
} from '@/application/llm/patternDetectionPrompt';
import type { ClusterAssignment, ClusterType } from '@/types';
import { logger } from '@/infrastructure/observability/logger';

export class DetectPatternsUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly clusterQuery: IClusterQueryRepository,
    private readonly clusterCommand: IClusterCommandRepository,
    private readonly llm: ILLMPort,
    private readonly retry: LLMRetryPolicy,
    private readonly validator: LLMResponseValidator,
  ) {}

  async execute(userId: string): Promise<{ classified: number }> {
    const rawExps = await this.expRepo.findUnclassified(userId);
    const classifiedIds = await this.clusterQuery.findClassifiedIds(rawExps.map((e) => e.id));
    const targets = rawExps.filter((e) => !classifiedIds.has(e.id));

    let classified = 0;

    for (const expData of targets) {
      const experience = new Experience(expData);
      const userMessage = buildPatternUserMessage(experience);

      let raw: string;
      try {
        raw = await this.retry.execute(() =>
          this.llm.generate(PATTERN_SYSTEM_PROMPT, userMessage, 512),
        );
      } catch (err) {
        logger.warn('detect:llm_failed', { experienceId: expData.id, err });
        continue;
      }

      const parsed = this.validator.validatePatternResponse(raw);
      if (!parsed || parsed.assignments.length === 0) continue;

      const assignments: ClusterAssignment[] = parsed.assignments.map((a) => ({
        ...a,
        label: a.label ?? PATTERN_CLUSTER_LABELS[a.clusterType as ClusterType] ?? a.clusterType,
      }));

      try {
        await this.clusterCommand.classifyExperienceAtomic(userId, expData.id, assignments);
        classified++;
      } catch (err) {
        logger.error('detect:atomic_failed', { experienceId: expData.id, err });
      }
    }

    return { classified };
  }
}
