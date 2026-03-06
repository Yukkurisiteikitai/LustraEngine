import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { inferTraits, buildPersonaJson } from '@/lib/traitInference';
import type { EpisodeCluster, ExperienceRecord, LMConfig, TraitName } from '@/types';

interface InferRequestBody {
  lmConfig: LMConfig;
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

    let body: InferRequestBody;
    try {
      body = (await req.json()) as InferRequestBody;
    } catch {
      return NextResponse.json({ message: 'JSONの形式が不正です' }, { status: 400 });
    }

    const { lmConfig } = body;
    if (!lmConfig?.provider || !['claude', 'lmstudio'].includes(lmConfig.provider)) {
      return NextResponse.json(
        { message: 'lmConfig.provider が不正です（claude または lmstudio）' },
        { status: 400 },
      );
    }

    if (lmConfig.provider === 'claude' && !lmConfig.claudeApiKey) {
      return NextResponse.json({ message: 'Claude API キーが設定されていません' }, { status: 400 });
    }

    // Fetch clusters
    const { data: rawClusters, error: clustersError } = await supabase
      .from('episode_clusters')
      .select('*')
      .eq('user_id', user.id)
      .order('detected_count', { ascending: false });

    if (clustersError) {
      return NextResponse.json(
        { message: `クラスター取得エラー: ${clustersError.message}` },
        { status: 500 },
      );
    }

    const clusters: EpisodeCluster[] = (rawClusters ?? []).map((c) => ({
      id: c.id,
      userId: c.user_id,
      clusterType: c.cluster_type,
      label: c.label,
      description: c.description,
      strength: c.strength,
      detectedCount: c.detected_count,
      lastDetectedAt: c.last_detected_at,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // Fetch recent 20 experiences
    const { data: rawExperiences, error: expError } = await supabase
      .from('experiences')
      .select('id, logged_at, description, stress_level, action_result, domain_id')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(20);

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

    // Run trait inference
    const traitScores = await inferTraits(clusters, experiences, lmConfig);

    // Upsert traits into DB
    const traitRows = (Object.entries(traitScores) as [TraitName, number][]).map(
      ([name, score]) => ({
        user_id: user.id,
        name,
        score,
        updated_at: new Date().toISOString(),
      }),
    );

    const { error: upsertError } = await supabase
      .from('traits')
      .upsert(traitRows, { onConflict: 'user_id,name' });

    if (upsertError) {
      console.error('[API/traits/infer] upsert traits error:', upsertError);
      return NextResponse.json(
        { message: `trait保存エラー: ${upsertError.message}` },
        { status: 500 },
      );
    }

    // Build and insert persona snapshot
    const personaJson = buildPersonaJson(traitScores, clusters, experiences);

    const { error: snapshotError } = await supabase.from('persona_snapshots').insert({
      user_id: user.id,
      persona_json: personaJson,
    });

    if (snapshotError) {
      console.error('[API/traits/infer] insert snapshot error:', snapshotError);
      // Non-fatal: traits were saved successfully
    }

    return NextResponse.json({ traits: traitScores, message: 'トレイト推論が完了しました' });
  } catch (err) {
    console.error('[API/traits/infer] POST unhandled error:', err);
    return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
