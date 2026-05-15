export interface CreateExperienceDTO {
  description: string;
  stressLevel: number;
  domain: string;
  actionResult: 'AVOIDED' | 'CONFRONTED';
  source?: string;
  visibility?: 'private' | 'analysis_allowed' | 'excluded';
  reportDifficulty?: number;
  careful?: boolean;
  actionMemo?: string;
  goal?: string;
  action?: string;
  emotion?: string;
  context?: string;
}

export interface ExperienceResponseDTO {
  id: string;
  date: string;
  description: string;
  stressLevel: number;
  actionResult: 'AVOIDED' | 'CONFRONTED';
  domain?: string;
  visibility?: 'private' | 'analysis_allowed' | 'excluded';
  reportDifficulty?: number;
  careful?: boolean;
}
