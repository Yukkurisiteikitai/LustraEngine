import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PersonaSnapshot } from '@/types';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    const { data: raw, error } = await supabase
      .from('persona_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[API/persona] SELECT error:', error);
      return NextResponse.json({ message: `取得エラー: ${error.message}` }, { status: 500 });
    }

    if (!raw) {
      return NextResponse.json({ snapshot: null });
    }

    const snapshot: PersonaSnapshot = {
      id: raw.id,
      userId: raw.user_id,
      personaJson: raw.persona_json,
      createdAt: raw.created_at,
    };

    return NextResponse.json({ snapshot });
  } catch (err) {
    console.error('[API/persona] GET unhandled error:', err);
    return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
