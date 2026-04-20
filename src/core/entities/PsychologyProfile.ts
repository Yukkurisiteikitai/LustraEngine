/**
 * 心理学的プロファイルのドメインエンティティ
 * WEIRDバイアス注記: Big FiveはWEIRD集団(西洋・高学歴・工業化・富裕・民主主義)で
 * 開発された。スコアを「良い/悪い」の評価軸にしないこと。
 */

export type NarrativeSequence = 'redemption' | 'contamination' | 'stable' | 'unknown';
export type AttributionLocus = 'internal' | 'external';
export type AttributionStability = 'stable' | 'unstable';
export type AttributionControllability = 'controllable' | 'uncontrollable';
export type AttachmentStyle = 'secure' | 'preoccupied' | 'dismissing' | 'fearful';
export type IdentityDomain = 'career' | 'values' | 'relationships' | 'interests';
export type IdentityStatus = 'achievement' | 'moratorium' | 'foreclosure' | 'diffusion';
export type BigFiveDomain =
  'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism';
export type TheoryCategory =
  'cognitive_distortion' | 'attachment_pattern' | 'motivation_pattern' |
  'narrative_theme' | 'behavioral_pattern';

export interface CognitiveDistortion {
  type: string; // 'all_or_nothing' | 'catastrophizing' | 'should_statements' 等
  severity: 1 | 2 | 3; // 1=軽度 2=中等度 3=重度
}

export interface ExperiencePsychologyAnalysis {
  narrativeSequence?: NarrativeSequence;
  agencyScore?: number;       // 0-5
  communionScore?: number;    // 0-5
  attributionLocus?: AttributionLocus;
  attributionStability?: AttributionStability;
  attributionControllability?: AttributionControllability;
  cognitiveDistortions: string[];
  disclosureDifficulty?: number; // 1-5
}

export interface BigFiveScore {
  userId: string;
  openness?: number;
  conscientiousness?: number;
  extraversion?: number;
  agreeableness?: number;
  neuroticism?: number;
  confidence: number;
  evidenceCount: number;
  applyCulturalAdjustment: boolean;
  updatedAt: Date;
}

export interface BigFiveFacet {
  userId: string;
  domain: BigFiveDomain;
  facetName: string;
  score?: number;
  confidence: number;
}

export interface AttachmentProfile {
  userId: string;
  anxietyScore?: number;   // 1-7
  avoidanceScore?: number; // 1-7
  style?: AttachmentStyle;
  confidence: number;
  evidenceCount: number;
}

export interface IdentityStatusRecord {
  userId: string;
  domain: IdentityDomain;
  explorationScore?: number; // 0-1
  commitmentScore?: number;  // 0-1
  status?: IdentityStatus;
}
