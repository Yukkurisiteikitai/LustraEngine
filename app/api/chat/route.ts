import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { chat } from '@/lib/chatInference';
import type { ChatMessage, ExperienceRecord, LMConfig, PersonaJson } from '@/types';

interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
  lmConfig?: LMConfig;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    let body: ChatRequestBody;
    try {
      body = (await req.json()) as ChatRequestBody;
    } catch {
      return NextResponse.json({ message: 'JSONの形式が不正です' }, { status: 400 });
    }

    const { message, history, lmConfig } = body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ message: 'メッセージが空です' }, { status: 400 });
    }

    if (!lmConfig?.provider || !['claude', 'lmstudio'].includes(lmConfig.provider)) {
      return NextResponse.json(
        { message: 'lmConfig.provider が不正です（claude または lmstudio）' },
        { status: 400 },
      );
    }

    if (lmConfig.provider === 'claude' && !lmConfig.claudeApiKey) {
      return NextResponse.json({ message: 'Claude API キーが設定されていません' }, { status: 400 });
    }

    // Fetch latest persona snapshot
    const { data: snapshots, error: snapshotError } = await supabase
      .from('persona_snapshots')
      .select('persona_json')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (snapshotError) {
      return NextResponse.json(
        { message: `ペルソナ取得エラー: ${snapshotError.message}` },
        { status: 500 },
      );
    }

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json(
        { message: 'ペルソナスナップショットが見つかりません。先にペルソナページでトレイト推論を実行してください。' },
        { status: 422 },
      );
    }

    const persona = snapshots[0].persona_json as PersonaJson;

    // Fetch 5 recent experiences
    const { data: rawExperiences, error: expError } = await supabase
      .from('experiences')
      .select('id, logged_at, description, stress_level, action_result, domain_id')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(5);

    if (expError) {
      return NextResponse.json(
        { message: `記録取得エラー: ${expError.message}` },
        { status: 500 },
      );
    }

    const experiences: ExperienceRecord[] = (rawExperiences ?? []).map((e) => ({
      id: e.id,
      date: e.logged_at,
      description: e.description,
      stressLevel: e.stress_level,
      domain: 'WORK' as const,
      actionResult: e.action_result as 'AVOIDED' | 'CONFRONTED',
    }));

    const response = await chat(persona, experiences, history ?? [], message, lmConfig);

    return NextResponse.json({ response });
  } catch (err) {
    console.error('[API/chat] POST unhandled error:', err);
    return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
