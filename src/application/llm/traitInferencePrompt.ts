import type { ClusterData } from '@/core/domains/cluster/Cluster';
import type { ExperienceData } from '@/core/domains/experience/Experience';

export const TRAIT_SYSTEM_PROMPT = `You are a personality trait inference engine for a self-reflection app.
Given a user's behavioral pattern clusters and recent experiences, infer scores for 6 personality traits.

Trait mapping context:
- procrastination → low discipline (0.2-0.4), high self_criticism (0.6-0.8)
- social_avoidance → high introversion (0.6-0.8), high social_anxiety (0.6-0.8)
- authority_anxiety → high social_anxiety (0.7-0.9), low risk_tolerance (0.2-0.4)
- perfectionism → high self_criticism (0.7-0.9), moderate discipline (0.5-0.7)

Score 0.0 = very low, 1.0 = very high. Use the full 0-1 range.

Respond ONLY with valid JSON:
{
  "traits": {
    "introversion": 0.0,
    "discipline": 0.0,
    "curiosity": 0.0,
    "risk_tolerance": 0.0,
    "self_criticism": 0.0,
    "social_anxiety": 0.0
  }
}`;

export function buildTraitUserMessage(
  clusters: ClusterData[],
  experiences: ExperienceData[],
): string {
  const clusterSummary = clusters
    .map((c) => `- ${c.clusterType} (detected ${c.detectedCount}x, strength ${c.strength})`)
    .join('\n');

  const recentSummary = experiences
    .slice(0, 20)
    .map(
      (e) =>
        `- [${e.actionResult}] stress=${e.stressLevel} "${e.description.slice(0, 80)}"`,
    )
    .join('\n');

  return [
    'Behavioral clusters:',
    clusterSummary || '(none detected yet)',
    '',
    'Recent experiences (up to 20):',
    recentSummary || '(no recent experiences)',
  ].join('\n');
}
