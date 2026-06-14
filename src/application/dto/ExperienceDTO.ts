import type { ActionResult, ExperienceEmotion, TimeOfDay } from '@/types';

export interface CreateExperienceDTO {
  description: string;
  stressLevel: number;
  domain: string;
  actionResult: ActionResult;
  source?: string;
  visibility?: 'private' | 'analysis_allowed' | 'excluded';
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

export interface ExperienceResponseDTO {
  id: string;
  date: string;
  description: string;
  stressLevel: number;
  actionResult: ActionResult;
  domain?: string;
  visibility?: 'private' | 'analysis_allowed' | 'excluded';
  reportDifficulty?: number;
  careful?: boolean;
  emotions?: ExperienceEmotion[];
  context?: string;
  trigger?: string;
  timeOfDay?: TimeOfDay;
  durationMinutes?: number;
}
