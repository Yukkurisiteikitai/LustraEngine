import type { ClusterType } from '@/types';

export type { ClusterType };

export interface ClusterData {
  id: string;
  userId: string;
  clusterType: ClusterType;
  label: string;
  description: string | null;
  strength: number;
  detectedCount: number;
  lastDetectedAt: string | null;
}
