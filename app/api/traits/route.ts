import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Trait } from '@/types';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    const { data: rawTraits, error } = await supabase
      .from('traits')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('[API/traits] SELECT error:', error);
      return NextResponse.json({ message: `取得エラー: ${error.message}` }, { status: 500 });
    }

    const traits: Trait[] = (rawTraits ?? []).map((t) => ({
      id: t.id,
      userId: t.user_id,
      name: t.name,
      score: t.score,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({ traits });
  } catch (err) {
    console.error('[API/traits] GET unhandled error:', err);
    return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
