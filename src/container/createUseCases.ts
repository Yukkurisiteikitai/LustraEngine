import type { SupabaseClient } from '@supabase/supabase-js';
import type { IJobQueue } from '@/application/jobs/IJobQueue';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import { createRepositories, createRepositoriesWithAdmin } from './createRepositories';
import { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import { LogExperienceUseCase } from '@/application/usecases/LogExperienceUseCase';
import { GetAnalyticsUseCase } from '@/application/usecases/GetAnalyticsUseCase';
import { DetectPatternsUseCase } from '@/application/usecases/DetectPatternsUseCase';
import { InferTraitsUseCase } from '@/application/usecases/InferTraitsUseCase';
import { ChatUseCase } from '@/application/usecases/ChatUseCase';
import { CreateThreadUseCase } from '@/application/usecases/CreateThreadUseCase';
import { GetThreadHistoryUseCase } from '@/application/usecases/GetThreadHistoryUseCase';
import { SaveChatMessageUseCase } from '@/application/usecases/SaveChatMessageUseCase';
import { RethinkMessageUseCase } from '@/application/usecases/RethinkMessageUseCase';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';

export function createLogExperienceUseCase(supabase: SupabaseClient, queue: IJobQueue) {
  const { experience, user } = createRepositories(supabase);
  return new LogExperienceUseCase(experience, user, queue);
}

export function createGetAnalyticsUseCase(supabase: SupabaseClient) {
  const { experience } = createRepositories(supabase);
  return new GetAnalyticsUseCase(experience);
}

export function createDetectPatternsUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, clusterCommand } = createRepositories(supabase);
  return new DetectPatternsUseCase(
    experience,
    clusterCommand,
    llm,
    new LLMRetryPolicy(),
    new LLMResponseValidator(),
  );
}

export function createInferTraitsUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, clusterQuery, trait, persona } = createRepositories(supabase);
  return new InferTraitsUseCase(
    experience,
    clusterQuery,
    trait,
    persona,
    llm,
    new LLMRetryPolicy(),
    new LLMResponseValidator(),
  );
}

export function createChatUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, persona } = createRepositories(supabase);
  return new ChatUseCase(experience, persona, llm);
}

export function createThreadUseCase(supabase: SupabaseClient) {
  const { thread } = createRepositories(supabase);
  return new CreateThreadUseCase(thread);
}

export function createGetThreadHistoryUseCase(supabase: SupabaseClient) {
  const { thread, pairNode, message } = createRepositories(supabase);
  return new GetThreadHistoryUseCase(thread, pairNode, message);
}

export function createSaveChatMessageUseCase(supabase: SupabaseClient) {
  const { pairNode, message } = createRepositories(supabase);
  const { llmModel } = createRepositoriesWithAdmin(supabase, createAdminClient());
  return new SaveChatMessageUseCase(pairNode, message, llmModel);
}

export function createRethinkMessageUseCase(supabase: SupabaseClient) {
  const { pairNode, message } = createRepositories(supabase);
  return new RethinkMessageUseCase(pairNode, message);
}
