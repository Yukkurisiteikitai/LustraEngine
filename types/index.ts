export type Domain = 'WORK' | 'RELATIONSHIP' | 'HEALTH' | 'MONEY' | 'SELF';

export type ActionResult = 'AVOIDED' | 'CONFRONTED';

export interface ObstacleInput {
  description: string;
  stressLevel: number;
  domain: Domain;
  actionResult: ActionResult;
}

export interface LogPayload {
  date: string;
  obstacles: ObstacleInput[];
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

export interface ObstacleRecord extends ObstacleInput {
  id: string;
  date: string;
}
