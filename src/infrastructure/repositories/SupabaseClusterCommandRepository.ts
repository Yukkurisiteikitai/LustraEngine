import type { SupabaseClient } from '@supabase/supabase-js';
import type { IClusterCommandRepository } from '@/core/domains/cluster/IClusterCommandRepository';
import type { ClusterAssignment } from '@/types';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseClusterCommandRepository implements IClusterCommandRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // direct service-role writes keep worker processing independent of auth.uid()
  async classifyExperienceAtomic(
    experienceId: string,
    assignments: ClusterAssignment[],
  ): Promise<void> {
    const { data: experienceRow, error: experienceError } = await this.supabase
      .from('experiences')
      .select('user_id')
      .eq('id', experienceId)
      .single();

    if (experienceError) {
      throw new InfrastructureError('cluster:classifyAtomic failed', experienceError);
    }

    const userId = experienceRow.user_id as string;

    for (const assignment of assignments) {
      const { data: clusterRow, error: clusterError } = await this.supabase
        .from('episode_clusters')
        .upsert(
          {
            user_id: userId,
            cluster_type: assignment.clusterType,
            label: assignment.label,
            description: assignment.description,
            last_detected_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,cluster_type' },
        )
        .select('id, detected_count')
        .single();

      if (clusterError) {
        throw new InfrastructureError('cluster:classifyAtomic failed', clusterError);
      }

      const { error: mapError } = await this.supabase
        .from('experience_cluster_map')
        .insert({
          experience_id: experienceId,
          cluster_id: clusterRow.id,
          confidence: assignment.confidence,
          reasoning: assignment.reasoning,
        });

      if (mapError) {
        if (mapError.code !== '23505') {
          throw new InfrastructureError('cluster:classifyAtomic failed', mapError);
        }
        continue;
      }

      const { error: updateError } = await this.supabase
        .from('episode_clusters')
        .update({
          detected_count: (clusterRow.detected_count as number | null | undefined ?? 0) + 1,
          last_detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', clusterRow.id)
        .eq('user_id', userId);

      if (updateError) {
        throw new InfrastructureError('cluster:classifyAtomic failed', updateError);
      }
    }
  }
}
