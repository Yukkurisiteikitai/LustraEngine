import type { TraitHypothesisInsert, TraitHypothesisRecord } from './TraitHypothesis';

export interface ITraitHypothesisRepository {
  append(record: TraitHypothesisInsert): Promise<void>;
  appendMany(records: TraitHypothesisInsert[]): Promise<void>;
  findByUser(userId: string, limit?: number): Promise<TraitHypothesisRecord[]>;
  findActiveByUser(userId: string): Promise<TraitHypothesisRecord[]>;
  markRevised(ids: string[], supersededById?: string | null): Promise<void>;
}
