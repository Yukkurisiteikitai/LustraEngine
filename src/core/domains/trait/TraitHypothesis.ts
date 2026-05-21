import type { TraitName } from '@/types';

export type TraitHypothesisStatus =
  | 'active'
  | 'revised'
  | 'rejected'
  | 'archived'
  | 'needs_review'
  | 'stale_due_to_evidence_deletion';

export interface TraitHypothesisRecord {
  id: string;
  userId: string;
  traitKey: TraitName | string;
  hypothesisLabel: string;
  hypothesisText: string;
  score?: number;
  confidence: number;
  uncertainty: number;
  evidenceIds: string[];
  sourcePatternIds: string[];
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  status: TraitHypothesisStatus;
  supersedesHypothesisId?: string | null;
  supersededByHypothesisId?: string | null;
  analysisJobId?: string | null;
  createdAt: string;
}

export interface TraitHypothesisInsert
  extends Omit<TraitHypothesisRecord, 'id' | 'createdAt'> {
  id?: string;
  createdAt?: string;
}

export interface TraitHypothesisSummary {
  generatedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  evidenceCount: number;
  usedModel: string;
  usedPromptVersion: string;
}

export interface TraitHypothesisResult {
  hypotheses: TraitHypothesisRecord[];
  summary: TraitHypothesisSummary;
}
