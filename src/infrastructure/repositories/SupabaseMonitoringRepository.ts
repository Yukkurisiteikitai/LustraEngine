import type { SupabaseClient } from '@supabase/supabase-js';
import type { IMonitoringRepository, DbStats } from '@/core/ports/IMonitoringRepository';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

interface RawDbStats {
  total_db_size_mb: number;
  table_sizes: Array<{ table_name: string; size_mb: number }>;
}

export class SupabaseMonitoringRepository implements IMonitoringRepository {
  constructor(private readonly adminClient: SupabaseClient) {}

  async getDbStats(): Promise<DbStats> {
    const { data, error } = await this.adminClient.rpc('get_db_stats');

    if (error) {
      throw new InfrastructureError('monitoring:getDbStats rpc failed', error);
    }

    if (data == null || typeof data !== 'object' || !('total_db_size_mb' in data)) {
      throw new InfrastructureError('monitoring:getDbStats returned invalid data', { data });
    }

    const raw = data as RawDbStats;

    return {
      totalDbSizeMb: raw.total_db_size_mb,
      tableSizes: (raw.table_sizes ?? []).map((t) => ({
        tableName: t.table_name,
        sizeMb: t.size_mb,
      })),
      checkedAt: new Date().toISOString(),
    };
  }
}
