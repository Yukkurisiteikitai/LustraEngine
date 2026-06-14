import type {
  ActionResult,
  ClusterAssignment,
  ExperienceEmotion,
  TimeOfDay,
  TraitName,
} from '@/types';
import { ACTION_RESULT_VALUES, TIME_OF_DAY_VALUES } from '@/types';
import type { BigFiveDomain, ExperiencePsychologyAnalysis } from '@/core/entities/PsychologyProfile';
import { extractJsonFromLLMResponse } from './extractJsonFromLLMResponse';
import { STRUCTURED_DIARY_SCHEMA_META } from '@/application/llm/structuredDiaryPrompt';

export interface StructuredDiaryResponse {
  description: string;
  context: string;
  timeOfDay: TimeOfDay;
  durationMinutes: number | null;
  emotions: ExperienceEmotion[];
  actionResult: ActionResult;
  trigger: string | null;
  needsTriggerQuestion: boolean;
  triggerQuestion: string | null;
}

const BIG_FIVE_DOMAINS: BigFiveDomain[] = [
  'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism',
];
const IDENTITY_DOMAINS = ['career', 'values', 'relationships', 'interests'] as const;

export interface BigFiveResponse {
  bigFive: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
    confidence: number;
  };
  facets: Array<{
    domain: BigFiveDomain;
    facetName: string;
    score: number;
    confidence: number;
  }>;
  attachmentHints: {
    anxietyScore: number | null;
    avoidanceScore: number | null;
  } | null;
  identityStatus: Array<{
    domain: typeof IDENTITY_DOMAINS[number];
    explorationScore: number;
    commitmentScore: number;
  }>;
}

const TRAIT_NAMES: TraitName[] = [
  'introversion',
  'discipline',
  'curiosity',
  'risk_tolerance',
  'self_criticism',
  'social_anxiety',
];

const VALID_NARRATIVE_SEQUENCES = ['redemption', 'contamination', 'stable', 'unknown'] as const;
const VALID_ATTRIBUTION_LOCUS = ['internal', 'external'] as const;
const VALID_ATTRIBUTION_STABILITY = ['stable', 'unstable'] as const;
const VALID_ATTRIBUTION_CONTROLLABILITY = ['controllable', 'uncontrollable'] as const;
const VALID_COGNITIVE_DISTORTIONS = new Set([
  'all_or_nothing', 'overgeneralization', 'catastrophizing',
  'should_statements', 'personalization', 'mind_reading',
]);

export class LLMResponseValidator {
  validatePatternResponse(raw: string): {
    assignments: ClusterAssignment[];
    psychologyAnalysis?: ExperiencePsychologyAnalysis;
  } | null {
    try {
      const parsed = JSON.parse(raw) as { assignments?: unknown; psychologyAnalysis?: unknown };
      if (!Array.isArray(parsed?.assignments)) return null;
      const assignments = (parsed.assignments as ClusterAssignment[]).filter(
        (a) =>
          typeof a.clusterType === 'string' &&
          typeof a.confidence === 'number' &&
          a.confidence >= 0.6,
      );

      const psychologyAnalysis = this.extractPsychologyAnalysis(parsed.psychologyAnalysis);

      return { assignments, psychologyAnalysis };
    } catch {
      return null;
    }
  }

  private extractPsychologyAnalysis(raw: unknown): ExperiencePsychologyAnalysis | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const p = raw as Record<string, unknown>;

    const narrativeSequence = VALID_NARRATIVE_SEQUENCES.includes(p.narrativeSequence as never)
      ? (p.narrativeSequence as ExperiencePsychologyAnalysis['narrativeSequence'])
      : undefined;

    const agencyScore = typeof p.agencyScore === 'number'
      ? Math.max(0, Math.min(5, p.agencyScore))
      : undefined;

    const communionScore = typeof p.communionScore === 'number'
      ? Math.max(0, Math.min(5, p.communionScore))
      : undefined;

    const attributionLocus = VALID_ATTRIBUTION_LOCUS.includes(p.attributionLocus as never)
      ? (p.attributionLocus as ExperiencePsychologyAnalysis['attributionLocus'])
      : undefined;

    const attributionStability = VALID_ATTRIBUTION_STABILITY.includes(p.attributionStability as never)
      ? (p.attributionStability as ExperiencePsychologyAnalysis['attributionStability'])
      : undefined;

    const attributionControllability = VALID_ATTRIBUTION_CONTROLLABILITY.includes(p.attributionControllability as never)
      ? (p.attributionControllability as ExperiencePsychologyAnalysis['attributionControllability'])
      : undefined;

    const cognitiveDistortions = Array.isArray(p.cognitiveDistortions)
      ? (p.cognitiveDistortions as unknown[]).filter(
          (d): d is string => typeof d === 'string' && VALID_COGNITIVE_DISTORTIONS.has(d),
        )
      : [];

    return {
      narrativeSequence,
      agencyScore,
      communionScore,
      attributionLocus,
      attributionStability,
      attributionControllability,
      cognitiveDistortions,
    };
  }

  validateBigFiveResponse(raw: string): BigFiveResponse | null {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const bf = parsed?.bigFive as Record<string, unknown> | undefined;
      if (!bf) return null;

      const clamp = (v: unknown, min = 0, max = 1) =>
        typeof v === 'number' ? Math.max(min, Math.min(max, v)) : null;

      const openness = clamp(bf.openness);
      const conscientiousness = clamp(bf.conscientiousness);
      const extraversion = clamp(bf.extraversion);
      const agreeableness = clamp(bf.agreeableness);
      const neuroticism = clamp(bf.neuroticism);
      const confidence = clamp(bf.confidence) ?? 0.1;

      if (
        openness === null || conscientiousness === null || extraversion === null ||
        agreeableness === null || neuroticism === null
      ) return null;

      const facets: BigFiveResponse['facets'] = [];
      if (Array.isArray(parsed.facets)) {
        for (const f of parsed.facets as Record<string, unknown>[]) {
          const facetScore = clamp(f.score);
          const facetConfidence = clamp(f.confidence);
          if (
            BIG_FIVE_DOMAINS.includes(f.domain as BigFiveDomain) &&
            typeof f.facetName === 'string' &&
            facetScore !== null &&
            facetConfidence !== null
          ) {
            facets.push({
              domain: f.domain as BigFiveDomain,
              facetName: f.facetName,
              score: facetScore,
              confidence: facetConfidence,
            });
          }
        }
      }

      let attachmentHints: BigFiveResponse['attachmentHints'] = null;
      if (parsed.attachmentHints && typeof parsed.attachmentHints === 'object') {
        const ah = parsed.attachmentHints as Record<string, unknown>;
        attachmentHints = {
          anxietyScore: clamp(ah.anxietyScore, 1, 7),
          avoidanceScore: clamp(ah.avoidanceScore, 1, 7),
        };
      }

      const identityStatus: BigFiveResponse['identityStatus'] = [];
      if (Array.isArray(parsed.identityStatus)) {
        for (const is_ of parsed.identityStatus as Record<string, unknown>[]) {
          const explorationScore = clamp(is_.explorationScore);
          const commitmentScore = clamp(is_.commitmentScore);
          if (
            IDENTITY_DOMAINS.includes(is_.domain as typeof IDENTITY_DOMAINS[number]) &&
            explorationScore !== null &&
            commitmentScore !== null
          ) {
            identityStatus.push({
              domain: is_.domain as typeof IDENTITY_DOMAINS[number],
              explorationScore,
              commitmentScore,
            });
          }
        }
      }

      return {
        bigFive: { openness, conscientiousness, extraversion, agreeableness, neuroticism, confidence },
        facets,
        attachmentHints,
        identityStatus,
      };
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

  // LLM-1 structured diary extraction. Uses the defensive JSON extractor so
  // fenced / preamble-wrapped output from qwen3-swallow still parses.
  // Returns null when the response is unrecoverable — callers MUST surface
  // that as an explicit error (no silent template fallback).
  validateStructuredDiaryResponse(raw: string): StructuredDiaryResponse | null {
    const parsed = extractJsonFromLLMResponse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;

    const description = typeof p.description === 'string' ? p.description.trim() : '';
    const context = typeof p.context === 'string' ? p.context.trim() : '';
    if (!description) return null;

    if (!TIME_OF_DAY_VALUES.includes(p.time_of_day as TimeOfDay)) return null;
    const timeOfDay = p.time_of_day as TimeOfDay;

    if (!ACTION_RESULT_VALUES.includes(p.action_result as ActionResult)) return null;
    const actionResult = p.action_result as ActionResult;

    let durationMinutes: number | null = null;
    if (p.duration_minutes === null || p.duration_minutes === undefined) {
      durationMinutes = null;
    } else if (typeof p.duration_minutes === 'number' && p.duration_minutes >= 0) {
      durationMinutes = Math.round(p.duration_minutes);
    } else {
      return null;
    }

    const emotions: ExperienceEmotion[] = [];
    if (Array.isArray(p.emotions)) {
      for (const e of p.emotions) {
        if (!e || typeof e !== 'object') continue;
        const label = (e as { label?: unknown }).label;
        const intensity = (e as { intensity?: unknown }).intensity;
        if (
          typeof label === 'string' &&
          label.trim() !== '' &&
          typeof intensity === 'number' &&
          intensity >= STRUCTURED_DIARY_SCHEMA_META.intensityMin &&
          intensity <= STRUCTURED_DIARY_SCHEMA_META.intensityMax
        ) {
          emotions.push({
            label: label.trim(),
            intensity: Math.round(intensity) as ExperienceEmotion['intensity'],
          });
        }
        if (emotions.length >= STRUCTURED_DIARY_SCHEMA_META.maxEmotions) break;
      }
    }

    const trigger =
      typeof p.trigger === 'string' && p.trigger.trim() !== '' ? p.trigger.trim() : null;
    const needsTriggerQuestion =
      typeof p.needs_trigger_question === 'boolean' ? p.needs_trigger_question : trigger === null;
    const triggerQuestion =
      typeof p.trigger_question === 'string' && p.trigger_question.trim() !== ''
        ? p.trigger_question.trim()
        : null;

    return {
      description,
      context,
      timeOfDay,
      durationMinutes,
      emotions,
      actionResult,
      trigger,
      needsTriggerQuestion,
      triggerQuestion,
    };
  }
}
