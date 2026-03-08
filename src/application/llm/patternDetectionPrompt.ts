import type { ClusterType } from '@/types';
import type { Experience } from '@/core/domains/experience/Experience';

export const PATTERN_SYSTEM_PROMPT = `You are a behavioral pattern classifier for a self-reflection app.
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

const CLUSTER_LABELS: Record<ClusterType, string> = {
  procrastination: '先延ばし',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

export function buildPatternUserMessage(experience: Experience): string {
  const data = experience.toData();
  const parts = [`Experience: ${data.description}`];
  if (data.emotion) parts.push(`Emotion: ${data.emotion}`);
  if (data.goal) parts.push(`Goal: ${data.goal}`);
  if (data.context) parts.push(`Context: ${data.context}`);
  if (data.action) parts.push(`Action taken: ${data.action}`);
  parts.push(`Stress level: ${data.stressLevel}/5`);
  parts.push(`Outcome: ${data.actionResult === 'AVOIDED' ? 'Avoided' : 'Confronted'}`);
  return parts.join('\n');
}

export { CLUSTER_LABELS as PATTERN_CLUSTER_LABELS };
