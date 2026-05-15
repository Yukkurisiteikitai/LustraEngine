import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseExperienceRepository } from '@/infrastructure/repositories/SupabaseExperienceRepository';
import { SupabaseClusterQueryRepository } from '@/infrastructure/repositories/SupabaseClusterQueryRepository';
import { SupabaseClusterCommandRepository } from '@/infrastructure/repositories/SupabaseClusterCommandRepository';
import { SupabaseTraitRepository } from '@/infrastructure/repositories/SupabaseTraitRepository';
import { SupabaseTraitHypothesisRepository } from '@/infrastructure/repositories/SupabaseTraitHypothesisRepository';
import { SupabaseUserRepository } from '@/infrastructure/repositories/SupabaseUserRepository';
import { SupabaseThreadRepository } from '@/infrastructure/repositories/SupabaseThreadRepository';
import { SupabaseMessageRepository } from '@/infrastructure/repositories/SupabaseMessageRepository';
import { SupabasePairNodeRepository } from '@/infrastructure/repositories/SupabasePairNodeRepository';
import { SupabaseLlmModelRepository } from '@/infrastructure/repositories/SupabaseLlmModelRepository';
import { SupabasePsychologyRepository } from '@/infrastructure/repositories/SupabasePsychologyRepository';
import { SupabaseAnalysisJobRepository } from '@/infrastructure/repositories/SupabaseAnalysisJobRepository';
import { SupabaseUserLlmSettingsRepository } from '@/infrastructure/repositories/SupabaseUserLlmSettingsRepository';

export function createRepositories(supabase: SupabaseClient) {
  return {
    experience: new SupabaseExperienceRepository(supabase),
    clusterQuery: new SupabaseClusterQueryRepository(supabase),
    clusterCommand: new SupabaseClusterCommandRepository(supabase),
    trait: new SupabaseTraitRepository(supabase),
    traitHypothesis: new SupabaseTraitHypothesisRepository(supabase),
    user: new SupabaseUserRepository(supabase),
    thread: new SupabaseThreadRepository(supabase),
    message: new SupabaseMessageRepository(supabase),
    pairNode: new SupabasePairNodeRepository(supabase),
    psychology: new SupabasePsychologyRepository(supabase),
    analysisJob: new SupabaseAnalysisJobRepository(supabase),
    llmSettings: new SupabaseUserLlmSettingsRepository(supabase),
  };
}

export function createRepositoriesWithAdmin(supabase: SupabaseClient, adminClient: SupabaseClient) {
  return {
    ...createRepositories(supabase),
    llmModel: new SupabaseLlmModelRepository(adminClient),
  };
}
