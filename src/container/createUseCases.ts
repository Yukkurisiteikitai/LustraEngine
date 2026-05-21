import type { SupabaseClient } from '@supabase/supabase-js';
import type { ILLMPort } from '@/application/ports/ILLMPort';
import { createRepositories, createRepositoriesWithAdmin } from './createRepositories';
import { LLMRetryPolicy } from '@/application/llm/policies/LLMRetryPolicy';
import { LLMResponseValidator } from '@/application/llm/policies/LLMResponseValidator';
import { LogExperienceUseCase } from '@/application/usecases/LogExperienceUseCase';
import { GetAnalyticsUseCase } from '@/application/usecases/GetAnalyticsUseCase';
import { BuildAnalyticsViewModelUseCase } from '@/application/usecases/BuildAnalyticsViewModelUseCase';
import { DetectPatternsUseCase } from '@/application/usecases/DetectPatternsUseCase';
import { InferTraitsUseCase } from '@/application/usecases/InferTraitsUseCase';
import { CreateAnalysisJobUseCase } from '@/application/usecases/CreateAnalysisJobUseCase';
import { ChatUseCase } from '@/application/usecases/ChatUseCase';
import { CreateThreadUseCase } from '@/application/usecases/CreateThreadUseCase';
import { GetThreadHistoryUseCase } from '@/application/usecases/GetThreadHistoryUseCase';
import { SaveChatMessageUseCase } from '@/application/usecases/SaveChatMessageUseCase';
import { RethinkMessageUseCase } from '@/application/usecases/RethinkMessageUseCase';
import { ManageExperienceDispositionUseCase } from '@/application/usecases/ManageExperienceDispositionUseCase';
import { ExportUserDataUseCase } from '@/application/usecases/ExportUserDataUseCase';
import { createAdminClient } from '@/infrastructure/supabase/createAdminClient';
import { CheckDbLimitsUseCase } from '@/application/usecases/CheckDbLimitsUseCase';
import { SupabaseMonitoringRepository } from '@/infrastructure/repositories/SupabaseMonitoringRepository';
import { DiscordWebhookAdapter } from '@/infrastructure/notifications/DiscordWebhookAdapter';
import { logger } from '@/infrastructure/observability/logger';

export function createLogExperienceUseCase(supabase: SupabaseClient) {
  const { experience, user, userSettings } = createRepositories(supabase);
  return new LogExperienceUseCase(experience, user, userSettings);
}

export function createGetAnalyticsUseCase(supabase: SupabaseClient) {
  const { experience } = createRepositories(supabase);
  return new GetAnalyticsUseCase(experience);
}

export function createBuildAnalyticsViewModelUseCase(supabase: SupabaseClient) {
  const { experience } = createRepositories(supabase);
  return new BuildAnalyticsViewModelUseCase(experience);
}

export function createCreateAnalysisJobUseCase(supabase: SupabaseClient) {
  const { analysisJob } = createRepositories(supabase);
  return new CreateAnalysisJobUseCase(analysisJob);
}

export function createDetectPatternsUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, clusterCommand, psychology } = createRepositories(supabase);
  return new DetectPatternsUseCase(
    experience,
    clusterCommand,
    llm,
    logger,
    new LLMRetryPolicy(),
    new LLMResponseValidator(),
    psychology,
  );
}
export function createInferTraitsUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, clusterQuery, traitHypothesis, userSettings } = createRepositories(supabase);
  return new InferTraitsUseCase(
    experience,
    clusterQuery,
    traitHypothesis,
    llm,
    logger,
    new LLMRetryPolicy(),
    new LLMResponseValidator(),
    userSettings,
  );
}

export function createChatUseCase(supabase: SupabaseClient, llm: ILLMPort) {
  const { experience, traitHypothesis, psychology, userSettings } = createRepositories(supabase);
  return new ChatUseCase(experience, traitHypothesis, llm, psychology, userSettings);
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
  const { pairNode } = createRepositories(supabase);
  return new RethinkMessageUseCase(pairNode, supabase);
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

export function createManageExperienceDispositionUseCase(supabase: SupabaseClient) {
  const { experience, traitHypothesis } = createRepositories(supabase);
  return new ManageExperienceDispositionUseCase(experience, traitHypothesis);
}

export function createExportUserDataUseCase(supabase: SupabaseClient) {
  const { experience, traitHypothesis, userSettings, llmSettings, thread, pairNode, message } =
    createRepositories(supabase);
  return new ExportUserDataUseCase(
    experience,
    traitHypothesis,
    userSettings,
    llmSettings,
    thread,
    pairNode,
    message,
  );
}
