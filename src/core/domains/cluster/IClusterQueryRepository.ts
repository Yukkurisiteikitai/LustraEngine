import type { ClusterData } from './Cluster';

// CQRS: read only — cache layer / read replica 対象
export interface IClusterQueryRepository {
  findByUser(userId: string): Promise<ClusterData[]>;
}
