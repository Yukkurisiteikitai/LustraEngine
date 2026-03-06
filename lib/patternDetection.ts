// Server-side only. Called from /api/patterns/detect route.

import type {
  ClassificationResult,
  ClusterAssignment,
  ClusterType,
  ExperienceForClassification,
  LMConfig,
} from '@/types';

const SYSTEM_PROMPT = `You are a behavioral pattern classifier for a self-reflection app.
Classify the user's experience into 0-2 cognitive behavioral clusters.

Available clusters:
- procrastination: Avoiding tasks, delaying decisions, difficulty starting
- social_avoidance: Avoiding social interactions, conflict avoidance, isolation
- authority_anxiety: Fear of authority figures, performance anxiety, approval-seeking
- perfectionism: Fear of failure, excessive self-criticism, all-or-nothing thinking

Respond ONLY with valid JSON in this exact format:
{
  "assignments": [
    {
      "clusterType": "procrastination",
      "label": "先延ばし",
      "description": "Brief description of why this cluster applies",
      "confidence": 0.85,
      "reasoning": "Specific reasoning based on the experience"
    }
  ]
}

If no cluster applies, return: { "assignments": [] }
Maximum 2 assignments. Only include clusters with confidence >= 0.6.`;

function buildUserMessage(experience: ExperienceForClassification): string {
  const parts = [`Experience: ${experience.description}`];
  if (experience.emotion) parts.push(`Emotion: ${experience.emotion}`);
  if (experience.goal) parts.push(`Goal: ${experience.goal}`);
  if (experience.context) parts.push(`Context: ${experience.context}`);
  if (experience.action) parts.push(`Action taken: ${experience.action}`);
  parts.push(`Stress level: ${experience.stressLevel}/10`);
  parts.push(`Outcome: ${experience.actionResult === 'AVOIDED' ? 'Avoided' : 'Confronted'}`);
  return parts.join('\n');
}

const CLUSTER_LABELS: Record<ClusterType, string> = {
  procrastination: '先延ばし',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

function parseResponse(raw: string, experienceId: string): ClassificationResult {
  try {
    const json = JSON.parse(raw) as { assignments?: ClusterAssignment[] };
    const assignments = (json.assignments ?? []).map((a) => ({
      ...a,
      label: a.label ?? CLUSTER_LABELS[a.clusterType] ?? a.clusterType,
    }));
    return { experienceId, assignments };
  } catch {
    console.warn('[patternDetection] Failed to parse LLM response:', raw);
    return { experienceId, assignments: [] };
  }
}

async function callClaude(
  experience: ExperienceForClassification,
  config: LMConfig,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.claudeApiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(experience) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return json.content.find((c) => c.type === 'text')?.text ?? '{"assignments":[]}';
}

async function callLMStudio(
  experience: ExperienceForClassification,
  config: LMConfig,
): Promise<string> {
  const endpoint = (config.lmstudioEndpoint ?? 'http://localhost:1234').replace(/\/$/, '');
  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.lmstudioApiKey ?? 'lm-studio'}`,
    },
    body: JSON.stringify({
      model: config.lmstudioModel ?? 'local-model',
      max_tokens: 512,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(experience) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices[0]?.message?.content ?? '{"assignments":[]}';
}

export async function classifyExperience(
  experience: ExperienceForClassification,
  config: LMConfig,
): Promise<ClassificationResult> {
  let raw: string;

  if (config.provider === 'claude') {
    raw = await callClaude(experience, config);
  } else {
    raw = await callLMStudio(experience, config);
  }

  return parseResponse(raw, experience.id);
}
