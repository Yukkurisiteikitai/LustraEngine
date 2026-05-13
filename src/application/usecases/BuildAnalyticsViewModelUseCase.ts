import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import { GetAnalyticsUseCase } from '@/application/usecases/GetAnalyticsUseCase';
import {
  ANALYTICS_VIEW_MODEL_VERSION,
  type AnalyticsViewObstacle,
  type DashboardViewModel,
  type HomeSummaryViewModel,
} from '@/application/viewmodels/AnalyticsViewModel';
import type { AnalyticsDTO } from '@/application/dto/AnalyticsDTO';
import type { ExperienceResponseDTO } from '@/application/dto/ExperienceDTO';

function latestLogCreatedAt(recentExperiences: ExperienceResponseDTO[]): string | null {
  return recentExperiences[0]?.date ?? null;
}

function averageStressOrNull(data: AnalyticsDTO): number | null {
  return data.recentExperiences.length > 0 ? data.avgStress7Days : null;
}

function toViewObstacle(experience: ExperienceResponseDTO): AnalyticsViewObstacle {
  return {
    id: experience.id,
    description: experience.description,
    domain: experience.domain ?? '',
    stressLevel: experience.stressLevel,
    createdAt: experience.date,
    actionResult: experience.actionResult,
  };
}

export function toHomeSummaryViewModel(dashboard: DashboardViewModel): HomeSummaryViewModel {
  return {
    version: ANALYTICS_VIEW_MODEL_VERSION,
    generatedAt: dashboard.generatedAt,
    latestLogCreatedAt: dashboard.latestLogCreatedAt,
    confrontRate: dashboard.confrontRate,
    averageStress: dashboard.averageStress,
    streakDays: dashboard.streakDays,
  };
}

export class BuildAnalyticsViewModelUseCase {
  private readonly analyticsUseCase: GetAnalyticsUseCase;

  constructor(experienceRepository: IExperienceRepository) {
    this.analyticsUseCase = new GetAnalyticsUseCase(experienceRepository);
  }

  async buildDashboard(userId: string): Promise<DashboardViewModel> {
    const data = await this.analyticsUseCase.execute(userId);
    const generatedAt = new Date().toISOString();

    return {
      version: ANALYTICS_VIEW_MODEL_VERSION,
      generatedAt,
      latestLogCreatedAt: latestLogCreatedAt(data.recentExperiences),
      confrontRate: data.confrontationRate,
      averageStress: averageStressOrNull(data),
      streakDays: data.streakDays,
      stressTrend: data.stressTrend,
      recentObstacles: data.recentExperiences.map(toViewObstacle),
    };
  }

  async buildHome(userId: string): Promise<HomeSummaryViewModel> {
    const dashboard = await this.buildDashboard(userId);
    return toHomeSummaryViewModel(dashboard);
  }
}
