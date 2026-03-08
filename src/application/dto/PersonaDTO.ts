import type { PersonaJson, TraitName } from '@/types';

export interface TraitDTO {
  name: TraitName;
  score: number;
}

export interface PersonaDTO {
  id: string;
  personaJson: PersonaJson;
  traitsHash?: string;
  version?: number;
  createdAt: string;
}
