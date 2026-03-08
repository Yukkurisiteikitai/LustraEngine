import type { TraitData, TraitName } from './Trait';

export interface ITraitRepository {
  findByUser(userId: string): Promise<TraitData[]>;
  save(userId: string, traits: Record<TraitName, number>): Promise<void>;
}
