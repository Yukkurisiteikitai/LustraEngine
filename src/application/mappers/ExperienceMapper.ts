import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { ExperienceResponseDTO } from '@/application/dto/ExperienceDTO';
import type { ActionResult, ExperienceEmotion, TimeOfDay } from '@/types';

function parseEmotions(raw: unknown): ExperienceEmotion[] | undefined {
  if (!raw) return undefined;
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(value)) return undefined;
  const out: ExperienceEmotion[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const label = (item as { label?: unknown }).label;
    const intensity = (item as { intensity?: unknown }).intensity;
    if (
      typeof label === 'string' &&
      typeof intensity === 'number' &&
      intensity >= 1 &&
      intensity <= 5
    ) {
      out.push({ label, intensity: intensity as ExperienceEmotion['intensity'] });
    }
  }
  return out.length > 0 ? out : undefined;
}

export class ExperienceMapper {
  static toDTO(data: ExperienceData): ExperienceResponseDTO {
    return {
      id: data.id,
      date: data.date,
      description: data.description,
      stressLevel: data.stressLevel,
      actionResult: data.actionResult,
      domain: data.domainKey ?? data.domainId,
      visibility: data.visibility,
      reportDifficulty: data.reportDifficulty,
      careful: data.careful,
      emotions: data.emotions,
      context: data.context,
      trigger: data.trigger,
      timeOfDay: data.timeOfDay,
      durationMinutes: data.durationMinutes,
    };
  }

  static fromRow(row: Record<string, unknown>): ExperienceData {
    // supports both nested join (domains.description) and flat RPC column (domain_description)
    const domainsJoin = row.domains as { description?: string } | null | undefined;
    const domainKey =
      domainsJoin?.description ??
      (row.domain_description as string | null | undefined) ??
      undefined;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      description: row.description as string,
      stressLevel: row.stress_level as number,
      actionResult: row.action_result as ActionResult,
      source: (row.source as string | null) ?? undefined,
      visibility:
        (row.visibility as 'private' | 'analysis_allowed' | 'excluded' | null) ??
        'private',
      reportDifficulty: (row.report_difficulty as number | null) ?? 3,
      careful: Boolean(row.careful),
      actionMemo: (row.action_memo as string | null) ?? undefined,
      goal: (row.goal as string | null) ?? undefined,
      action: (row.action as string | null) ?? undefined,
      emotion: (row.emotion as string | null) ?? undefined,
      emotions: parseEmotions(row.emotions),
      context: (row.context as string | null) ?? undefined,
      trigger: (row.trigger as string | null) ?? undefined,
      timeOfDay: (row.time_of_day as TimeOfDay | null) ?? undefined,
      durationMinutes: (row.duration_minutes as number | null) ?? undefined,
      domainId: (row.domain_id as string | null) ?? undefined,
      domainKey,
      date: row.logged_at as string,
      softDeletedAt: (row.soft_deleted_at as string | null) ?? null,
    };
  }
}
