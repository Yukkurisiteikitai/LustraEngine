import { Experience } from '@/core/domains/experience/Experience';
import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IClusterCommandRepository } from '@/core/domains/cluster/IClusterCommandRepository';
import type { IPsychologyRepository } from '@/core/ports/IPsychologyRepository';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import type { ILoggerPort } from '@/application/ports/ILoggerPort';
import type { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import type { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
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

  async execute(userId: string): Promise<{ classified: number }> {
    const targets = await this.expRepo.findUnclassified(userId);

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

      if (parsed?.psychologyAnalysis) {
        try {
          await this.psychologyRepo.updateExperiencePsychologyAnalysis(
            expData.id,
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

      try {
        await this.clusterCommand.classifyExperienceAtomic(expData.id, assignments);
        classified++;
      } catch (err) {
        this.logger.error('detect:atomic_failed', { experienceId: expData.id, err });
      }
    }

    return { classified };
  }
}
