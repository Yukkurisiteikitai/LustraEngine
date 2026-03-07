import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseExperienceRepository } from '@/infrastructure/repositories/SupabaseExperienceRepository';
import { SupabaseClusterQueryRepository } from '@/infrastructure/repositories/SupabaseClusterQueryRepository';
import { SupabaseClusterCommandRepository } from '@/infrastructure/repositories/SupabaseClusterCommandRepository';
import { SupabaseTraitRepository } from '@/infrastructure/repositories/SupabaseTraitRepository';
import { SupabasePersonaRepository } from '@/infrastructure/repositories/SupabasePersonaRepository';
import { SupabaseUserRepository } from '@/infrastructure/repositories/SupabaseUserRepository';

export function createRepositories(supabase: SupabaseClient) {
  return {
    experience: new SupabaseExperienceRepository(supabase),
    clusterQuery: new SupabaseClusterQueryRepository(supabase),
    clusterCommand: new SupabaseClusterCommandRepository(supabase),
    trait: new SupabaseTraitRepository(supabase),
    persona: new SupabasePersonaRepository(supabase),
    user: new SupabaseUserRepository(supabase),
  };
}
