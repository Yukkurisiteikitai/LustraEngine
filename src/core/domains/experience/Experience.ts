import type { ActionResult, ExperienceEmotion, TimeOfDay } from '@/types';

export interface ExperienceData {
  id: string;
  userId: string;
  description: string;
  stressLevel: number;
  actionResult: ActionResult;
  source?: string;
  visibility: 'private' | 'analysis_allowed' | 'excluded';
  reportDifficulty: number;
  careful: boolean;
  actionMemo?: string;
  goal?: string;
  action?: string;
  emotion?: string;            // legacy free-text
  emotions?: ExperienceEmotion[];
  context?: string;
  trigger?: string;
  timeOfDay?: TimeOfDay;
  durationMinutes?: number;
  domainId?: string;
  domainKey?: string; // e.g. 'WORK', 'RELATIONSHIP'
  date: string; // logged_at (YYYY-MM-DD)
  softDeletedAt?: string | null;
}

// CONFRONTED_* and PARTIAL count as confrontation. AVOIDED does not.
export function isConfrontationResult(r: ActionResult): boolean {
  return r === 'CONFRONTED_SUCCESS' || r === 'CONFRONTED_FAILED' || r === 'PARTIAL';
}

export class Experience {
  constructor(private readonly data: ExperienceData) {}

  get id() {
    return this.data.id;
  }
  get stressLevel() {
    return this.data.stressLevel;
  }
  get date() {
    return this.data.date;
  }

  isConfrontation(): boolean {
    return isConfrontationResult(this.data.actionResult);
  }

  // 向き合った場合は回避より影響が小さい (行動することでストレス軽減)
  stressImpact(): number {
    return this.isConfrontation() ? this.data.stressLevel * 0.7 : this.data.stressLevel;
  }

  toData(): ExperienceData {
    return { ...this.data };
  }
}
