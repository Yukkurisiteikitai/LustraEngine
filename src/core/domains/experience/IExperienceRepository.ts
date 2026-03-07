import type { ExperienceData } from './Experience';

export interface CreateExperienceInput {
  description: string;
  stressLevel: number;
  domain: string;
  actionResult: 'AVOIDED' | 'CONFRONTED';
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
  findSince(userId: string, fromDate: string): Promise<ExperienceData[]>;
  findAllDates(userId: string): Promise<string[]>;
  findUnclassified(userId: string): Promise<ExperienceData[]>;
  findRecent(userId: string, limit: number): Promise<ExperienceData[]>;
}
