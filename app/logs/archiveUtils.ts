import type { ExperienceData } from '@/core/domains/experience/Experience';
import type { LogSearchField } from '@/application/search/logSearch';

export type ArchiveExperience = ExperienceData & {
  matchedField?: LogSearchField;
  searchRank?: number;
};

export type AgeBucket = '7d' | '30d' | '90d' | '180d' | '365d' | 'older';

export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  '7d': '1週間以内',
  '30d': '1か月以内',
  '90d': '3か月以内',
  '180d': '6か月以内',
  '365d': '1年以内',
  older: 'それ以前',
};

export const AGE_BUCKET_ORDER: AgeBucket[] = ['7d', '30d', '90d', '180d', '365d', 'older'];

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function getAgeBucket(date: string, now = new Date()): AgeBucket {
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const logged = parseDay(date).getTime();
  const diffDays = Math.max(0, Math.floor((current - logged) / 86_400_000));

  if (diffDays < 7) return '7d';
  if (diffDays < 30) return '30d';
  if (diffDays < 90) return '90d';
  if (diffDays < 180) return '180d';
  if (diffDays < 365) return '365d';
  return 'older';
}

export function groupArchiveExperiences(
  experiences: ArchiveExperience[],
  now = new Date(),
): Array<{ bucket: AgeBucket; items: ArchiveExperience[] }> {
  const grouped = new Map<AgeBucket, ArchiveExperience[]>();
  for (const bucket of AGE_BUCKET_ORDER) {
    grouped.set(bucket, []);
  }

  for (const experience of experiences) {
    const bucket = getAgeBucket(experience.date, now);
    grouped.get(bucket)?.push(experience);
  }

  return AGE_BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: grouped.get(bucket) ?? [],
  })).filter((group) => group.items.length > 0);
}

export function formatArchiveDate(date: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function getActionLabel(actionResult: ExperienceData['actionResult']): string {
  return actionResult === 'CONFRONTED' ? '向き合った' : '回避した';
}

export function getVisibilityLabel(visibility: ExperienceData['visibility']): string {
  switch (visibility) {
    case 'analysis_allowed':
      return '分析OK';
    case 'excluded':
      return '除外';
    default:
      return '非公開';
  }
}

export function getSearchFieldText(
  experience: ExperienceData,
  field: LogSearchField | undefined,
): string {
  switch (field) {
    case 'context':
      return experience.context ?? experience.description;
    case 'action':
      return experience.action ?? experience.description;
    case 'emotion':
      return experience.emotion ?? experience.description;
    case 'goal':
      return experience.goal ?? experience.description;
    case 'action_memo':
      return experience.actionMemo ?? experience.description;
    case 'description':
    default:
      return experience.description;
  }
}

export function buildPreviewText(
  experience: ExperienceData,
  field: LogSearchField | undefined,
): string {
  const text = getSearchFieldText(experience, field).trim();
  if (text.length <= 120) {
    return text;
  }

  return `${text.slice(0, 120)}…`;
}
