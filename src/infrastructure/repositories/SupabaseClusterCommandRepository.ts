import type { SupabaseClient } from '@supabase/supabase-js';
import type { IClusterCommandRepository } from '@/core/domains/cluster/IClusterCommandRepository';
import type { ClusterAssignment } from '@/types';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseClusterCommandRepository implements IClusterCommandRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // classifyExperienceAtomic: Supabase RPC で原子性を保証
  async classifyExperienceAtomic(
    userId: string,
    experienceId: string,
    assignments: ClusterAssignment[],
  ): Promise<void> {
    const { error } = await this.supabase.rpc('classify_experience_atomic', {
      p_experience_id: experienceId,
      p_assignments: assignments,
    });

    if (error) throw new InfrastructureError('cluster:classifyAtomic failed', error);
  }
}
