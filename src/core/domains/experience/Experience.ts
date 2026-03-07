export interface ExperienceData {
  id: string;
  userId: string;
  description: string;
  stressLevel: number;
  actionResult: 'AVOIDED' | 'CONFRONTED';
  actionMemo?: string;
  goal?: string;
  action?: string;
  emotion?: string;
  context?: string;
  domainId?: string;
  domainKey?: string; // e.g. 'WORK', 'RELATIONSHIP'
  date: string; // logged_at (YYYY-MM-DD)
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
    return this.data.actionResult === 'CONFRONTED';
  }

  // CONFRONTED は回避より影響が小さい (行動することでストレス軽減)
  stressImpact(): number {
    return this.isConfrontation() ? this.data.stressLevel * 0.7 : this.data.stressLevel;
  }

  toData(): ExperienceData {
    return { ...this.data };
  }
}
