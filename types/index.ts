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
  id: string;
  savedAt: string;
  message: string;
  summary: {
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
