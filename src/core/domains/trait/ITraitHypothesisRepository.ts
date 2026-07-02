import type { TraitHypothesisInsert, TraitHypothesisRecord } from './TraitHypothesis';

export interface ITraitHypothesisRepository {
  append(record: TraitHypothesisInsert): Promise<void>;
  appendMany(records: TraitHypothesisInsert[]): Promise<void>;
  findByUser(userId: string, limit?: number): Promise<TraitHypothesisRecord[]>;
  findAllByUser(userId: string): Promise<TraitHypothesisRecord[]>;
  findActiveByUser(userId: string): Promise<TraitHypothesisRecord[]>;
  findLiveByUser(userId: string): Promise<TraitHypothesisRecord[]>;
  findHistoryByTraitKey(userId: string, traitKey: string): Promise<TraitHypothesisRecord[]>;
  reviseAtomic(prevId: string, userId: string, next: TraitHypothesisInsert): Promise<TraitHypothesisRecord>;
  confirm(id: string, userId: string): Promise<TraitHypothesisRecord>;
  hold(id: string, userId: string): Promise<TraitHypothesisRecord>;
  markRevised(ids: string[], supersededById?: string | null): Promise<void>;
  markStatusByEvidenceIds(
    userId: string,
    evidenceIds: string[],
    status: TraitHypothesisRecord['status'],
  ): Promise<number>;
}
