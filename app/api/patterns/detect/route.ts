import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { classifyExperience } from '@/lib/patternDetection';
import type { ExperienceForClassification, LMConfig } from '@/types';

interface DetectRequestBody {
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

    let body: DetectRequestBody;
    try {
      body = (await req.json()) as DetectRequestBody;
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

    // Fetch unclassified experiences (those not yet in experience_cluster_map)
    const { data: experiences, error: expError } = await supabase
      .from('experiences')
      .select('id, description, stress_level, action_result, goal, action, emotion, context')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (expError) {
      console.error('[API/patterns/detect] SELECT experiences error:', expError);
      return NextResponse.json(
        { message: `記録取得エラー: ${expError.message}` },
        { status: 500 },
      );
    }

    if (!experiences || experiences.length === 0) {
      return NextResponse.json({ classified: 0, message: '分析対象の記録がありません' });
    }

    // Get already-classified experience IDs
    const expIds = experiences.map((e) => e.id);
    const { data: existingMaps } = await supabase
      .from('experience_cluster_map')
      .select('experience_id')
      .in('experience_id', expIds);

    const classifiedIds = new Set((existingMaps ?? []).map((m) => m.experience_id));
    const unclassified = experiences.filter((e) => !classifiedIds.has(e.id));

    if (unclassified.length === 0) {
      return NextResponse.json({ classified: 0, message: '新しい分析対象がありません' });
    }

    let classified = 0;

    for (const exp of unclassified) {
      const expInput: ExperienceForClassification = {
        id: exp.id,
        description: exp.description,
        stressLevel: exp.stress_level,
        actionResult: exp.action_result as 'AVOIDED' | 'CONFRONTED',
        goal: exp.goal ?? undefined,
        action: exp.action ?? undefined,
        emotion: exp.emotion ?? undefined,
        context: exp.context ?? undefined,
      };

      let result;
      try {
        result = await classifyExperience(expInput, lmConfig);
      } catch (err) {
        console.warn('[API/patterns/detect] classifyExperience error for', exp.id, err);
        continue;
      }

      if (result.assignments.length === 0) continue;

      for (const assignment of result.assignments) {
        // Upsert cluster
        const { data: cluster, error: upsertError } = await supabase
          .from('episode_clusters')
          .upsert(
            {
              user_id: user.id,
              cluster_type: assignment.clusterType,
              label: assignment.label,
              description: assignment.description,
              last_detected_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,cluster_type' },
          )
          .select('id')
          .single();

        if (upsertError || !cluster) {
          console.error('[API/patterns/detect] upsert cluster error:', upsertError);
          continue;
        }

        // Insert mapping (ignore duplicates)
        const { error: mapError } = await supabase.from('experience_cluster_map').upsert(
          {
            experience_id: exp.id,
            cluster_id: cluster.id,
            confidence: assignment.confidence,
            reasoning: assignment.reasoning,
          },
          { onConflict: 'experience_id,cluster_id', ignoreDuplicates: true },
        );

        if (mapError) {
          console.error('[API/patterns/detect] upsert map error:', mapError);
          continue;
        }

        // Increment counter atomically
        await supabase.rpc('increment_cluster_count', { p_cluster_id: cluster.id });
      }

      classified++;
    }

    return NextResponse.json({
      classified,
      message: `${classified}件の記録を分析しました`,
    });
  } catch (err) {
    console.error('[API/patterns/detect] POST unhandled error:', err);
    return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
