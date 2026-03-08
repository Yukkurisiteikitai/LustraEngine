import type { TraitName } from '@/types';
import type { ClusterData } from '@/core/domains/cluster/Cluster';

export type { TraitName };

export interface TraitData {
  id: string;
  userId: string;
  name: TraitName;
  score: number;
  updatedAt: string;
}

export function buildFallbackTraits(clusters: ClusterData[]): Record<TraitName, number> {
  const traits: Record<TraitName, number> = {
    introversion: 0.5,
    discipline: 0.5,
    curiosity: 0.5,
    risk_tolerance: 0.5,
    self_criticism: 0.5,
    social_anxiety: 0.5,
  };

  for (const c of clusters) {
    const w = Math.min(c.detectedCount / 10, 1) * 0.3;
    if (c.clusterType === 'procrastination') {
      traits.discipline = Math.max(0, traits.discipline - w);
      traits.self_criticism = Math.min(1, traits.self_criticism + w);
    } else if (c.clusterType === 'social_avoidance') {
      traits.introversion = Math.min(1, traits.introversion + w);
      traits.social_anxiety = Math.min(1, traits.social_anxiety + w);
    } else if (c.clusterType === 'authority_anxiety') {
      traits.social_anxiety = Math.min(1, traits.social_anxiety + w);
      traits.risk_tolerance = Math.max(0, traits.risk_tolerance - w);
    } else if (c.clusterType === 'perfectionism') {
      traits.self_criticism = Math.min(1, traits.self_criticism + w);
    }
  }

  return traits;
}
