import type { ClusterAssignment, TraitName } from '@/types';

const TRAIT_NAMES: TraitName[] = [
  'introversion',
  'discipline',
  'curiosity',
  'risk_tolerance',
  'self_criticism',
  'social_anxiety',
];

export class LLMResponseValidator {
  validatePatternResponse(raw: string): { assignments: ClusterAssignment[] } | null {
    try {
      const parsed = JSON.parse(raw) as { assignments?: unknown };
      if (!Array.isArray(parsed?.assignments)) return null;
      const assignments = (parsed.assignments as ClusterAssignment[]).filter(
        (a) =>
          typeof a.clusterType === 'string' &&
          typeof a.confidence === 'number' &&
          a.confidence >= 0.6,
      );
      return { assignments };
    } catch {
      return null;
    }
  }

  validateTraitResponse(raw: string): Record<TraitName, number> | null {
    try {
      const parsed = JSON.parse(raw) as { traits?: Record<string, number> };
      if (!parsed?.traits) return null;

      const result = {} as Record<TraitName, number>;
      for (const name of TRAIT_NAMES) {
        const val = parsed.traits[name];
        result[name] = typeof val === 'number' ? Math.max(0, Math.min(1, val)) : 0.5;
      }
      return result;
    } catch {
      return null;
    }
  }
}
