import type { ExperienceData } from './Experience';
import type { EvidenceVisibility } from '@/types';

export interface ExperienceQueryOptions {
  visibility?: EvidenceVisibility | EvidenceVisibility[];
}

export interface CreateExperienceInput {
  description: string;
  stressLevel: number;
  domain: string;
  actionResult: 'AVOIDED' | 'CONFRONTED';
  source?: string;
  visibility?: EvidenceVisibility;
  reportDifficulty?: number;
  careful?: boolean;
  actionMemo?: string;
  goal?: string;
  action?: string;
  emotion?: string;
  context?: string;
}

export interface IExperienceRepository {
  save(
    userId: string,
    inputs: CreateExperienceInput[],
    date: string,
    domainMap: Map<string, string>,
  ): Promise<ExperienceData[]>;
  findSince(userId: string, fromDate: string, options?: ExperienceQueryOptions): Promise<ExperienceData[]>;
  findAllDates(userId: string): Promise<string[]>;
  findUnclassified(userId: string, options?: ExperienceQueryOptions): Promise<ExperienceData[]>;
  findRecent(userId: string, limit: number, options?: ExperienceQueryOptions): Promise<ExperienceData[]>;
}
