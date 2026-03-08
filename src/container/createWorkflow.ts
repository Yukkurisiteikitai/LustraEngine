import type { SupabaseClient } from '@supabase/supabase-js';
import { InMemoryQueue } from '@/infrastructure/jobs/InMemoryQueue';
import { ProcessExperienceWorkflow } from '@/application/workflows/ProcessExperienceWorkflow';
import { createDetectPatternsUseCase, createInferTraitsUseCase } from './createUseCases';
import { createLLM } from '@/infrastructure/llm/createLLM';
import type { DetectPatternsJobPayload } from '@/application/jobs/DetectPatternsJob';
import type { InferTraitsJobPayload } from '@/application/jobs/InferTraitsJob';

export function createProcessExperienceWorkflow(supabase: SupabaseClient, queue: InMemoryQueue) {
  const workflow = new ProcessExperienceWorkflow(
    (payload: DetectPatternsJobPayload) =>
      createDetectPatternsUseCase(supabase, createLLM(payload.lmConfig)),
    (payload: InferTraitsJobPayload) =>
      createInferTraitsUseCase(supabase, createLLM(payload.lmConfig)),
    queue,
  );

  // Handler 登録
  queue.register('detectPatterns', (p) =>
    workflow.runDetect(p as unknown as DetectPatternsJobPayload),
  );
  queue.register('inferTraits', (p) =>
    workflow.runInfer(p as unknown as InferTraitsJobPayload),
  );

  return workflow;
}
