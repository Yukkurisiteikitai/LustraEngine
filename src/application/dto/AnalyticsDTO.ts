import type { ExperienceResponseDTO } from './ExperienceDTO';

export interface AnalyticsDTO {
  confrontationRate: number;
  avgStress7Days: number;
  stressTrend: number[];
  streakDays: number;
  recentExperiences: ExperienceResponseDTO[];
}
