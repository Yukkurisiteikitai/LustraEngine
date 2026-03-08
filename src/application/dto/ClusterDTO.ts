import type { ClusterType } from '@/types';

export interface ClusterDTO {
  id: string;
  clusterType: ClusterType;
  label: string;
  description: string | null;
  strength: number;
  detectedCount: number;
  lastDetectedAt: string | null;
}

export interface MappingDTO {
  id: string;
  experienceId: string;
  clusterId: string;
  confidence: number | null;
  reasoning: string | null;
  clusterType?: ClusterType;
  clusterLabel?: string;
  experienceDescription?: string;
  createdAt: string;
}

export interface PatternsDTO {
  clusters: ClusterDTO[];
  recentMappings: MappingDTO[];
}
