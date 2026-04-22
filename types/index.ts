// --- Legacy domain type (Phase 3 で { id, name, description, color } に移行予定) ---
export type Domain = 'WORK' | 'RELATIONSHIP' | 'HEALTH' | 'MONEY' | 'SELF';

export type ActionResult = 'AVOIDED' | 'CONFRONTED';

// --- Experience input (Phase 1: Supabase 対応) ---
export interface ExperienceInput {
  description: string;
  stressLevel: number;
  domain: Domain;
  actionResult: ActionResult;
  actionMemo?: string;
  // 構造化フィールド（任意）
  goal?: string;
  action?: string;
  emotion?: string;
  context?: string;
}

export interface LogPayload {
  date: string;
  obstacles: ExperienceInput[];
}

export interface LogResponse {
  id?: string;
  savedAt?: string;
  message: string;
  summary?: {
    confrontationRate: number;
    avgStress7Days: number;
    streakDays: number;
  };
}

export interface DashboardSummary {
  confrontationRate: number;
  avgStress7Days: number;
  streakDays: number;
}

export interface ExperienceRecord extends ExperienceInput {
  id: string;
  date: string;
}

// --- Backward compatibility aliases ---
/** @deprecated Use ExperienceInput */
export type ObstacleInput = ExperienceInput;
/** @deprecated Use ExperienceRecord */
export type ObstacleRecord = ExperienceRecord;

// --- L3 Cognition Layer ---

export type ClusterType =
  | 'procrastination'
  | 'social_avoidance'
  | 'authority_anxiety'
  | 'perfectionism';

export interface EpisodeCluster {
  id: string;
  userId: string;
  clusterType: ClusterType;
  label: string;
  description: string | null;
  strength: number;
  detectedCount: number;
  lastDetectedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ExperienceClusterMap {
  id: string;
  experienceId: string;
  clusterId: string;
  confidence: number | null;
  reasoning: string | null;
  createdAt: string;
  // joined fields
  clusterType?: ClusterType;
  clusterLabel?: string;
  experienceDescription?: string;
}

export interface ClusterEdge {
  id: string;
  userId: string;
  sourceClusterId: string;
  targetClusterId: string;
  edgeType: 'leads_to' | 'triggers' | 'reinforces';
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceForClassification {
  id: string;
  description: string;
  stressLevel: number;
  actionResult: 'AVOIDED' | 'CONFRONTED';
  goal?: string;
  action?: string;
  emotion?: string;
  context?: string;
}

export interface ClusterAssignment {
  clusterType: ClusterType;
  label: string;
  description: string;
  confidence: number;
  reasoning: string;
}

export interface ClassificationResult {
  experienceId: string;
  assignments: ClusterAssignment[];
}

export interface PatternsResponse {
  clusters: EpisodeCluster[];
  recentMappings: ExperienceClusterMap[];
}

// --- L4 Persona Layer ---

export type TraitName =
  | 'introversion'
  | 'discipline'
  | 'curiosity'
  | 'risk_tolerance'
  | 'self_criticism'
  | 'social_anxiety';

export interface Trait {
  id: string;
  userId: string;
  name: TraitName;
  score: number; // 0-1
  updatedAt: string;
}

export interface PersonaJson {
  traits: Record<TraitName, number>;
  dominantClusters: { type: ClusterType; detectedCount: number }[];
  domainBreakdown: Record<string, number>;
}

export interface PersonaSnapshot {
  id: string;
  userId: string;
  personaJson: PersonaJson;
  createdAt: string;
}

// --- L5 Interaction Layer ---
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// --- LM Config (stored in localStorage, never in DB) ---

export type LMProvider = 'claude' | 'lmstudio';

export interface LMConfig {
  provider: LMProvider;
  claudeApiKey?: string;
  lmstudioEndpoint?: string;
  lmstudioApiKey?: string;
  lmstudioModel?: string;
}
