import { Experience } from '@/core/domains/experience/Experience';
import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import { computeAnalytics } from '@/core/domains/analytics/AnalyticsService';
import type { AnalyticsDTO } from '@/application/dto/AnalyticsDTO';
import { ExperienceMapper } from '@/application/mappers/ExperienceMapper';

export class GetAnalyticsUseCase {
  constructor(private readonly expRepo: IExperienceRepository) {}

  async execute(userId: string): Promise<AnalyticsDTO> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    const [recentData, allDates] = await Promise.all([
      this.expRepo.findSince(userId, fromDate),
      this.expRepo.findAllDates(userId),
    ]);

    const experiences = recentData.map((d) => new Experience(d));
    const result = computeAnalytics(experiences, allDates);

    return {
      confrontationRate: result.confrontationRate,
      avgStress7Days: result.avgStress7Days,
      stressTrend: result.stressTrend,
      streakDays: result.streakDays,
      recentExperiences: result.recentExperiences.map(ExperienceMapper.toDTO),
    };
  }
}
