import type { ExperienceData } from './Experience';
import type { ActionResult, EvidenceVisibility, ExperienceEmotion, TimeOfDay } from '@/types';

export interface ExperienceQueryOptions {
  visibility?: EvidenceVisibility | EvidenceVisibility[];
}

export interface CreateExperienceInput {
  description: string;
  stressLevel: number;
  domain: string;
  actionResult: ActionResult;
  source?: string;
  visibility?: EvidenceVisibility;
  reportDifficulty?: number;
  careful?: boolean;
  actionMemo?: string;
  goal?: string;
  action?: string;
  emotion?: string;
  emotions?: ExperienceEmotion[];
  context?: string;
  trigger?: string;
  timeOfDay?: TimeOfDay;
  durationMinutes?: number;
}

export interface IExperienceRepository {
  save(
    userId: string,
    inputs: CreateExperienceInput[],
    date: string,
    domainMap: Map<string, string>,
  ): Promise<ExperienceData[]>;
  findAllByUser(userId: string): Promise<ExperienceData[]>;
  findById(userId: string, experienceId: string): Promise<ExperienceData | null>;
  findSince(userId: string, fromDate: string, options?: ExperienceQueryOptions): Promise<ExperienceData[]>;
  findAllDates(userId: string, options?: ExperienceQueryOptions): Promise<string[]>;
  findUnclassified(userId: string, options?: ExperienceQueryOptions): Promise<ExperienceData[]>;
  findRecent(userId: string, limit: number, options?: ExperienceQueryOptions): Promise<ExperienceData[]>;
  softDelete(userId: string, experienceIds: string[]): Promise<ExperienceData[]>;
  exclude(userId: string, experienceIds: string[]): Promise<ExperienceData[]>;
}
