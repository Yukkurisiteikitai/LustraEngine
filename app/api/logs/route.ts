import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { Domain, ExperienceInput, LogPayload } from '@/types';

const DOMAIN_SET = new Set<Domain>(['WORK', 'RELATIONSHIP', 'HEALTH', 'MONEY', 'SELF']);
const ACTION_SET = new Set(['AVOIDED', 'CONFRONTED']);

function isValidObstacle(obstacle: unknown): obstacle is ExperienceInput {
  if (typeof obstacle !== 'object' || obstacle === null) {
    return false;
  }

  const candidate = obstacle as Partial<ExperienceInput>;
  return (
    typeof candidate.description === 'string' &&
    candidate.description.trim().length > 0 &&
    typeof candidate.stressLevel === 'number' &&
    Number.isInteger(candidate.stressLevel) &&
    candidate.stressLevel >= 1 &&
    candidate.stressLevel <= 5 &&
    typeof candidate.domain === 'string' &&
    DOMAIN_SET.has(candidate.domain as Domain) &&
    typeof candidate.actionResult === 'string' &&
    ACTION_SET.has(candidate.actionResult)
  );
}

async function ensureUserProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: User,
) {
  const displayName =
    typeof user.user_metadata?.display_name === 'string'
      ? (user.user_metadata.display_name as string)
      : null;

  const { error } = await supabase
    .from('users')
    .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id' });

  if (error) {
    throw new Error(`users 同期エラー: ${error.message}`);
  }
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data: experiences, error } = await supabase
      .from('experiences')
      .select('*')
      .gte('logged_at', fromDate)
      .order('logged_at', { ascending: false });

    if (error) {
      console.error('[API/logs] SELECT error:', error);
      return NextResponse.json({ message: `記録取得エラー: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ experiences });
  } catch (err) {
    console.error('[API/logs] GET unhandled error:', err);
    return NextResponse.json(
      { message: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    // auth.users に存在するユーザーと public.users を同期して FK 制約違反を防ぐ
    await ensureUserProfile(supabase, user);

    let payload: LogPayload;
    try {
      payload = (await request.json()) as LogPayload;
    } catch {
      return NextResponse.json({ message: 'JSONの形式が不正です' }, { status: 400 });
    }

    if (
      !payload ||
      typeof payload.date !== 'string' ||
      !Array.isArray(payload.obstacles) ||
      payload.obstacles.length === 0
    ) {
      return NextResponse.json(
        { message: 'date と obstacles は必須です' },
        { status: 400 },
      );
    }

    if (!payload.obstacles.every(isValidObstacle)) {
      return NextResponse.json(
        {
          message:
            'obstacles の形式が不正です（description, stressLevel(1-5), domain, actionResult が必要）',
        },
        { status: 400 },
      );
    }

    // 日付フォーマット検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      return NextResponse.json(
        { message: '日付形式が不正です（YYYY-MM-DD）' },
        { status: 400 },
      );
    }

    const rows = payload.obstacles.map((o) => ({
      user_id: user.id,
      logged_at: payload.date,
      description: o.description,
      stress_level: o.stressLevel,
      action_result: o.actionResult,
      action_memo: o.actionMemo ?? null,
      goal: o.goal ?? null,
      action: o.action ?? null,
      emotion: o.emotion ?? null,
      context: o.context ?? null,
    }));

    console.log('[API/logs] Inserting experiences for user:', user.id, 'count:', rows.length);

    const { data: inserted, error: insertError } = await supabase
      .from('experiences')
      .insert(rows)
      .select('id, created_at');

    if (insertError) {
      console.error('[API/logs] INSERT error:', insertError);
      return NextResponse.json(
        { message: `記録保存エラー: ${insertError.message}` },
        { status: 500 }
      );
    }

    if (!inserted || inserted.length === 0) {
      console.warn('[API/logs] INSERT returned no rows');
      return NextResponse.json(
        { message: '記録が保存されましたが、確認に失敗しました' },
        { status: 500 }
      );
    }

    // 直近7日の集計
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data: recent, error: recentError } = await supabase
      .from('experiences')
      .select('action_result, stress_level, logged_at')
      .gte('logged_at', fromDate);

    if (recentError) {
      console.error('[API/logs] SELECT recent error:', recentError);
      // この場合はエラーでなく、デフォルト値を返す
    }

    const recentList = recent ?? [];
    const confrontedCount = recentList.filter((r) => r.action_result === 'CONFRONTED').length;
    const confrontationRate =
      recentList.length > 0 ? Math.round((confrontedCount / recentList.length) * 100) : 0;
    const avgStress7Days =
      recentList.length > 0
        ? Number(
            (recentList.reduce((s, r) => s + r.stress_level, 0) / recentList.length).toFixed(1),
          )
        : 0;

    // streak calculation
    const { data: allDates, error: datesError } = await supabase
      .from('experiences')
      .select('logged_at')
      .order('logged_at', { ascending: false });

    if (datesError) {
      console.error('[API/logs] SELECT allDates error:', datesError);
    }

    const uniqueDates = [...new Set((allDates ?? []).map((d) => d.logged_at))];
    let streakDays = 0;
    const current = new Date();
    while (true) {
      const dateKey = current.toISOString().slice(0, 10);
      if (!uniqueDates.includes(dateKey)) break;
      streakDays += 1;
      current.setDate(current.getDate() - 1);
    }

    const first = inserted[0];

    console.log('[API/logs] Success:', {
      id: first.id,
      confrontationRate,
      avgStress7Days,
      streakDays,
    });

    return NextResponse.json({
      id: first.id,
      savedAt: first.created_at,
      message: '記録を保存しました。今日の一歩が未来を変えます。',
      summary: { confrontationRate, avgStress7Days, streakDays },
    });
  } catch (err) {
    console.error('[API/logs] POST unhandled error:', err);
    const errorMessage = err instanceof Error ? err.message : '予期しないエラー';
    return NextResponse.json(
      { message: `エラー: ${errorMessage}` },
      { status: 500 }
    );
  }
}
