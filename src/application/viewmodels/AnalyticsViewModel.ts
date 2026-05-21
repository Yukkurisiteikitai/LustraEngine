export const ANALYTICS_VIEW_MODEL_VERSION = 1 as const;

export type AnalyticsViewModelVersion = typeof ANALYTICS_VIEW_MODEL_VERSION;

export type AnalyticsObstacleActionResult = 'AVOIDED' | 'CONFRONTED';

export interface AnalyticsViewObstacle {
  id: string;
  description: string;
  domain: string;
  stressLevel: number;
  createdAt: string;
  actionResult: AnalyticsObstacleActionResult;
}

export interface DashboardViewModel {
  version: AnalyticsViewModelVersion;
  generatedAt: string;
  latestLogCreatedAt: string | null;
  confrontRate: number;
  averageStress: number | null;
  streakDays: number;
  stressTrend: number[];
  recentObstacles: AnalyticsViewObstacle[];
}

export interface HomeSummaryViewModel {
  version: AnalyticsViewModelVersion;
  generatedAt: string;
  latestLogCreatedAt: string | null;
  confrontRate?: number;
  averageStress?: number | null;
  streakDays?: number;
  recentObstacles?: AnalyticsViewObstacle[];
}

export type AnalyticsViewModel = DashboardViewModel | HomeSummaryViewModel;
