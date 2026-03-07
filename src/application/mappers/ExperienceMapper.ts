import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { ExperienceResponseDTO } from '@/application/dto/ExperienceDTO';

export class ExperienceMapper {
  static toDTO(data: ExperienceData): ExperienceResponseDTO {
    return {
      id: data.id,
      date: data.date,
      description: data.description,
      stressLevel: data.stressLevel,
      actionResult: data.actionResult,
      domain: data.domainKey ?? data.domainId,
    };
  }

  static fromRow(row: Record<string, unknown>): ExperienceData {
    const domainsJoin = row.domains as { description?: string } | null | undefined;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      description: row.description as string,
      stressLevel: row.stress_level as number,
      actionResult: row.action_result as 'AVOIDED' | 'CONFRONTED',
      actionMemo: (row.action_memo as string | null) ?? undefined,
      goal: (row.goal as string | null) ?? undefined,
      action: (row.action as string | null) ?? undefined,
      emotion: (row.emotion as string | null) ?? undefined,
      context: (row.context as string | null) ?? undefined,
      domainId: (row.domain_id as string | null) ?? undefined,
      domainKey: domainsJoin?.description ?? undefined,
      date: row.logged_at as string,
    };
  }
}
