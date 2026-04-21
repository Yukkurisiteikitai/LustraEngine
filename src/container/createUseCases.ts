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
import { CheckDbLimitsUseCase } from '@/application/usecases/CheckDbLimitsUseCase';
import { SupabaseMonitoringRepository } from '@/infrastructure/repositories/SupabaseMonitoringRepository';
import { DiscordWebhookAdapter } from '@/infrastructure/notifications/DiscordWebhookAdapter';

export function createLogExperienceUseCase(supabase: SupabaseClient, queue: IJobQueue) {
  const { experience, user } = createRepositories(supabase);
  return new LogExperienceUseCase(experience, user, queue);
}

export function createGetAnalyticsUseCase(supabase: SupabaseClient) {
  const { experience } = createRepositories(supabase);
  return new GetAnalyticsUseCase(experience);
}

export function createDetectPatternsUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, clusterCommand, psychology } = createRepositories(supabase);
  return new DetectPatternsUseCase(
    experience,
    clusterCommand,
    llm,
    new LLMRetryPolicy(),
    new LLMResponseValidator(),
    psychology,
  );
}

export function createInferTraitsUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, clusterQuery, trait, persona, psychology } = createRepositories(supabase);
  return new InferTraitsUseCase(
    experience,
    clusterQuery,
    trait,
    persona,
    psychology,
    llm,
    new LLMRetryPolicy(),
    new LLMResponseValidator(),
  );
}

export function createChatUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, persona, psychology } = createRepositories(supabase);
  return new ChatUseCase(experience, persona, llm, psychology);
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

export function createCheckDbLimitsUseCase(): CheckDbLimitsUseCase {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('Missing env var: DISCORD_WEBHOOK_URL');

  const warnMb = parseInt(process.env.SUPABASE_DB_SIZE_WARN_MB ?? '400', 10);
  const criticalMb = parseInt(process.env.SUPABASE_DB_SIZE_CRITICAL_MB ?? '480', 10);

  const adminClient = createAdminClient();
  return new CheckDbLimitsUseCase(
    new SupabaseMonitoringRepository(adminClient),
    new DiscordWebhookAdapter(webhookUrl),
    { warnMb, criticalMb },
  );
}
