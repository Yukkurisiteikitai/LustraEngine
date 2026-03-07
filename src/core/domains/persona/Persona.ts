import type { ClusterType, PersonaJson, TraitName } from '@/types';
import type { ClusterData } from '@/core/domains/cluster/Cluster';
import type { ExperienceData } from '@/core/domains/experience/Experience';

export type { PersonaJson };

export interface PersonaData {
  id: string;
  userId: string;
  personaJson: PersonaJson;
  traitsHash?: string;
  version?: number;
  createdAt: string;
}

export function buildPersonaJson(
  traits: Record<TraitName, number>,
  clusters: ClusterData[],
  experiences: ExperienceData[],
): PersonaJson {
  const dominantClusters = clusters
    .filter((c) => c.detectedCount > 0)
    .sort((a, b) => b.detectedCount - a.detectedCount)
    .slice(0, 3)
    .map((c) => ({ type: c.clusterType as ClusterType, detectedCount: c.detectedCount }));

  const domainBreakdown: Record<string, number> = {};
  for (const e of experiences) {
    const key = e.domainKey ?? e.domainId;
    if (key) {
      domainBreakdown[key] = (domainBreakdown[key] ?? 0) + 1;
    }
  }

  return { traits, dominantClusters, domainBreakdown };
}
