export enum StressLevel {
  Low = 1,
  Mild = 2,
  Normal = 3,
  High = 4,
  Danger = 5,
}

export const stressLevelDescriptions: Record<StressLevel, string> = {
  [StressLevel.Low]: '軽いストレス（特に気にするべきではない）',
  [StressLevel.Mild]: 'イラっとくるが、継続して問題ない',
  [StressLevel.Normal]: '日常的に感じるようになっている',
  [StressLevel.High]: '慢性的なストレス状態。対処が必要',
  [StressLevel.Danger]: '危険レベル。休息または環境の見直しが必要',
};

export function getStressLevelLabel(level: number): string {
  const stressLevel = level as StressLevel;
  return stressLevelDescriptions[stressLevel] || '不明なストレスレベル';
}

export function getStressColor(level: number): string {
  switch (level) {
    case StressLevel.Low:
      return '#10b981';
    case StressLevel.Mild:
      return '#3b82f6';
    case StressLevel.Normal:
      return '#f59e0b';
    case StressLevel.High:
      return '#ef4444';
    case StressLevel.Danger:
      return '#991b1b';
    default:
      return '#6b7280';
  }
}
