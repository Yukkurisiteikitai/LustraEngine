import type { PersonaData, PersonaJson } from './Persona';

export interface IPersonaRepository {
  saveSnapshot(userId: string, persona: PersonaJson, traitsHash: string): Promise<void>;
  getLatest(userId: string): Promise<PersonaData | null>;
  getHistory(userId: string, limit?: number): Promise<PersonaData[]>;
}
