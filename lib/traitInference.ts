// Server-side only. Called from /api/traits/infer route.

import type {
  ClusterType,
  EpisodeCluster,
  ExperienceRecord,
  LMConfig,
  PersonaJson,
  TraitName,
} from '@/types';

const TRAIT_NAMES: TraitName[] = [
  'introversion',
  'discipline',
  'curiosity',
  'risk_tolerance',
  'self_criticism',
  'social_anxiety',
];

const SYSTEM_PROMPT = `You are a personality trait inference engine for a self-reflection app.
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

function buildUserMessage(clusters: EpisodeCluster[], experiences: ExperienceRecord[]): string {
  const clusterSummary = clusters
    .map((c) => `- ${c.clusterType} (detected ${c.detectedCount}x, strength ${c.strength})`)
    .join('\n');

  const recentSummary = experiences
    .slice(0, 20)
    .map((e) => `- [${e.actionResult}] stress=${e.stressLevel} "${e.description.slice(0, 80)}"`)
    .join('\n');

  return [
    'Behavioral clusters:',
    clusterSummary || '(none detected yet)',
    '',
    'Recent experiences (up to 20):',
    recentSummary || '(no recent experiences)',
  ].join('\n');
}

function parseResponse(raw: string): Record<TraitName, number> | null {
  try {
    const json = JSON.parse(raw) as { traits?: Record<string, number> };
    if (!json.traits) return null;

    const result = {} as Record<TraitName, number>;
    for (const name of TRAIT_NAMES) {
      const val = json.traits[name];
      result[name] = typeof val === 'number' ? Math.max(0, Math.min(1, val)) : 0.5;
    }
    return result;
  } catch {
    console.warn('[traitInference] Failed to parse LLM response:', raw);
    return null;
  }
}

async function callClaude(message: string, config: LMConfig): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.claudeApiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return json.content.find((c) => c.type === 'text')?.text ?? '{}';
}

async function callLMStudio(message: string, config: LMConfig): Promise<string> {
  const endpoint = (config.lmstudioEndpoint ?? 'http://localhost:1234').replace(/\/$/, '');
  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.lmstudioApiKey ?? 'lm-studio'}`,
    },
    body: JSON.stringify({
      model: config.lmstudioModel ?? 'local-model',
      max_tokens: 256,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices[0]?.message?.content ?? '{}';
}

export async function inferTraits(
  clusters: EpisodeCluster[],
  experiences: ExperienceRecord[],
  config: LMConfig,
): Promise<Record<TraitName, number>> {
  const message = buildUserMessage(clusters, experiences);

  const raw =
    config.provider === 'claude'
      ? await callClaude(message, config)
      : await callLMStudio(message, config);

  return parseResponse(raw) ?? buildFallbackTraits(clusters);
}

function buildFallbackTraits(clusters: EpisodeCluster[]): Record<TraitName, number> {
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

export function buildPersonaJson(
  traits: Record<TraitName, number>,
  clusters: EpisodeCluster[],
  experiences: ExperienceRecord[],
): PersonaJson {
  const dominantClusters = clusters
    .filter((c) => c.detectedCount > 0)
    .sort((a, b) => b.detectedCount - a.detectedCount)
    .slice(0, 3)
    .map((c) => ({ type: c.clusterType as ClusterType, detectedCount: c.detectedCount }));

  const domainBreakdown: Record<string, number> = {};
  for (const e of experiences) {
    domainBreakdown[e.domain] = (domainBreakdown[e.domain] ?? 0) + 1;
  }

  return { traits, dominantClusters, domainBreakdown };
}
