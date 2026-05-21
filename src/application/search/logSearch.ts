export const LOG_SEARCH_FIELDS = [
  'description',
  'context',
  'action',
  'emotion',
  'goal',
  'action_memo',
] as const;

export type LogSearchField = (typeof LOG_SEARCH_FIELDS)[number];

export const LOG_SEARCH_FIELD_LABELS: Record<LogSearchField, string> = {
  description: '本文',
  context: '状況',
  action: '実際の行動',
  emotion: '感情',
  goal: 'ゴール',
  action_memo: 'メモ',
};

export function isLogSearchField(value: string): value is LogSearchField {
  return (LOG_SEARCH_FIELDS as readonly string[]).includes(value);
}

export function normalizeLogSearchField(value: string | null | undefined): LogSearchField {
  if (value && isLogSearchField(value)) {
    return value;
  }

  return 'description';
}
