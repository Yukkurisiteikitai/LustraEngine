import type { PersonaData } from '@/core/domains/persona/Persona';
import type { PersonaDTO } from '@/application/dto/PersonaDTO';

export class PersonaMapper {
  static toDTO(data: PersonaData): PersonaDTO {
    return {
      id: data.id,
      personaJson: data.personaJson,
      traitsHash: data.traitsHash,
      version: data.version,
      createdAt: data.createdAt,
    };
  }

  static fromRow(row: Record<string, unknown>): PersonaData {
    const raw = row.persona_json as Record<string, unknown> | null | undefined;
    const personaJson: PersonaData['personaJson'] = {
      traits: (raw?.traits ?? {}) as PersonaData['personaJson']['traits'],
      dominantClusters: Array.isArray(raw?.dominantClusters) ? raw.dominantClusters : [],
      domainBreakdown: (raw?.domainBreakdown ?? {}) as PersonaData['personaJson']['domainBreakdown'],
    };
    return {
      id: row.id as string,
      userId: row.user_id as string,
      personaJson,
      traitsHash: (row.traits_hash as string | null) ?? undefined,
      version: (row.version as number | null) ?? undefined,
      createdAt: row.created_at as string,
    };
  }
}
