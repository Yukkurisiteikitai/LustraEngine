import { Experience } from '@/core/domains/experience/Experience';
import type { ExperienceData } from '@/core/domains/experience/Experience';

export interface AnalyticsResult {
  confrontationRate: number;
  avgStress7Days: number;
  stressTrend: number[];
  streakDays: number;
  recentExperiences: ExperienceData[];
}

// 純粋関数 (外部依存ゼロ)
export function computeAnalytics(
  experiences: Experience[],
  allDates: string[],
): AnalyticsResult {
  const confronted = experiences.filter((e) => e.isConfrontation()).length;
  const confrontationRate =
    experiences.length > 0 ? Math.round((confronted / experiences.length) * 100) : 0;

  const avgStress7Days =
    experiences.length > 0
      ? Number(
          (experiences.reduce((s, e) => s + e.stressImpact(), 0) / experiences.length).toFixed(1),
        )
      : 0;

  // 日別ストレス推移 (直近7日)
  const stressByDate = new Map<string, number[]>();
  for (const exp of experiences) {
    const dateKey = exp.date;
    if (!stressByDate.has(dateKey)) stressByDate.set(dateKey, []);
    stressByDate.get(dateKey)!.push(exp.stressImpact());
  }

  const stressTrend: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const levels = stressByDate.get(dateKey) ?? [];
    const avg = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
    stressTrend.push(Math.round(avg));
  }

  // 連続記録日数
  const uniqueDates = new Set(allDates);
  let streakDays = 0;
  const current = new Date();
  while (true) {
    const dateKey = current.toISOString().slice(0, 10);
    if (!uniqueDates.has(dateKey)) break;
    streakDays += 1;
    current.setDate(current.getDate() - 1);
  }

  return {
    confrontationRate,
    avgStress7Days,
    stressTrend,
    streakDays,
    recentExperiences: experiences.slice(0, 10).map((e) => e.toData()),
  };
}
