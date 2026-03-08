import type { SupabaseClient } from '@supabase/supabase-js';
import type { IClusterQueryRepository } from '@/core/domains/cluster/IClusterQueryRepository';
import type { ClusterData } from '@/core/domains/cluster/Cluster';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabaseClusterQueryRepository implements IClusterQueryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByUser(userId: string): Promise<ClusterData[]> {
    const { data, error } = await this.supabase
      .from('episode_clusters')
      .select('*')
      .eq('user_id', userId)
      .order('detected_count', { ascending: false });

    if (error) throw new InfrastructureError('cluster:findByUser failed', error);

    return (data ?? []).map((c) => ({
      id: c.id as string,
      userId: c.user_id as string,
      clusterType: c.cluster_type as ClusterData['clusterType'],
      label: c.label as string,
      description: c.description as string | null,
      strength: c.strength as number,
      detectedCount: c.detected_count as number,
      lastDetectedAt: c.last_detected_at as string | null,
      createdAt: c.created_at as string,
    }));
  }

  async findClassifiedIds(expIds: string[]): Promise<Set<string>> {
    if (expIds.length === 0) return new Set();

    const { data, error } = await this.supabase
      .from('experience_cluster_map')
      .select('experience_id')
      .in('experience_id', expIds);

    if (error) throw new InfrastructureError('cluster:findClassifiedIds failed', error);

    return new Set((data ?? []).map((m) => m.experience_id as string));
  }
}
