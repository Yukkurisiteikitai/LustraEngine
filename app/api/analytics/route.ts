import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    // 直近7日の範囲
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data: recent, error } = await supabase
      .from('experiences')
      .select('id, logged_at, description, stress_level, action_result, domain_id')
      .gte('logged_at', fromDate)
      .order('logged_at', { ascending: false });

    if (error) {
      console.error('[API/analytics] SELECT error:', error);
      return NextResponse.json({ message: `分析データ取得エラー: ${error.message}` }, { status: 500 });
    }

    const recentList = recent ?? [];

    // 向き合い率
    const confrontedCount = recentList.filter((r) => r.action_result === 'CONFRONTED').length;
    const confrontationRate =
      recentList.length > 0 ? Math.round((confrontedCount / recentList.length) * 100) : 0;

    // 平均ストレス
    const avgStress7Days =
      recentList.length > 0
        ? Number(
            (recentList.reduce((s, r) => s + r.stress_level, 0) / recentList.length).toFixed(1),
          )
        : 0;

    // 日別ストレス推移（直近7日）
    const stressByDate = new Map<string, number[]>();
    for (const exp of recentList) {
      const dateKey = exp.logged_at;
      if (!stressByDate.has(dateKey)) {
        stressByDate.set(dateKey, []);
      }
      stressByDate.get(dateKey)!.push(exp.stress_level);
    }

    const stressTrend: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const levels = stressByDate.get(dateKey) ?? [];
      const avg = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
      stressTrend.push(Math.round(avg));
    }

    // 連続記録日数
    const { data: allDates, error: datesError } = await supabase
      .from('experiences')
      .select('logged_at')
      .order('logged_at', { ascending: false });

    if (datesError) {
      console.error('[API/analytics] SELECT allDates error:', datesError);
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

    // 直近の記録（最大10件）
    const recentExperiences = recentList.slice(0, 10).map((e) => ({
      id: e.id,
      date: e.logged_at,
      description: e.description,
      stressLevel: e.stress_level,
      actionResult: e.action_result,
      domain: 'WORK' as const, // Phase 3 で domain 名解決予定
    }));

    return NextResponse.json({
      confrontationRate,
      avgStress7Days,
      stressTrend,
      streakDays,
      recentExperiences,
    });
  } catch (err) {
    console.error('[API/analytics] Unhandled error:', err);
    const errorMessage = err instanceof Error ? err.message : '予期しないエラー';
    return NextResponse.json({ message: `エラー: ${errorMessage}` }, { status: 500 });
  }
}
