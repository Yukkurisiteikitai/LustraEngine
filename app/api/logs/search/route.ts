import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { handleError } from '@/lib/apiHelpers';
import { ExperienceMapper } from '@/application/mappers/ExperienceMapper';
import {
  isLogSearchField,
  normalizeLogSearchField,
  type LogSearchField,
} from '@/application/search/logSearch';
import type { ExperienceData } from '@/core/domains/experience/Experience';

type SearchRow = Record<string, unknown> & {
  matched_field?: string;
  search_rank?: number;
};

const SEARCH_FIELD_COLUMNS: Record<LogSearchField, string> = {
  description: 'description',
  context: 'context',
  action: 'action',
  emotion: 'emotion',
  goal: 'goal',
  action_memo: 'action_memo',
};

type SearchItem = {
  experience: ExperienceData;
  matchedField: LogSearchField;
  searchRank: number;
};

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function mapSearchRows(rows: unknown[], field: LogSearchField): SearchItem[] {
  return rows.map((row) => {
    const searchRow = row as SearchRow;
    return {
      experience: ExperienceMapper.fromRow(searchRow),
      matchedField: normalizeLogSearchField(searchRow.matched_field ?? field),
      searchRank: Number(searchRow.search_rank ?? 0),
    };
  });
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) {
      throw new ValidationError('qは必須です');
    }

    const fieldParam = url.searchParams.get('field');
    if (fieldParam && !isLogSearchField(fieldParam)) {
      throw new ValidationError('fieldはdescription, context, action, emotion, goal, action_memoのいずれかです');
    }
    const field = normalizeLogSearchField(fieldParam);
    const limitParam = Number(url.searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 50;

    const { data, error } = await supabase.rpc('search_experiences', {
      p_user_id: user.id,
      p_field: field,
      p_query: q,
      p_limit: limit,
    });

    const items = error
      ? await (async () => {
          console.warn('[logs:search] rpc fallback', {
            code: (error as { code?: string }).code,
            message: (error as { message?: string }).message,
          });

          const column = SEARCH_FIELD_COLUMNS[field];
          const pattern = `%${escapeLikePattern(q)}%`;
          const fallback = await supabase
            .from('experiences')
            .select('*')
            .eq('user_id', user.id)
            .is('soft_deleted_at', null)
            .ilike(column, pattern)
            .order('logged_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(limit);

          if (fallback.error) throw fallback.error;
          return mapSearchRows(fallback.data ?? [], field).map((item) => ({
            ...item,
            searchRank: 0,
          }));
        })()
      : mapSearchRows(data ?? [], field);

    return NextResponse.json({ items, field, q });
  } catch (error) {
    return handleError(error);
  }
}
