import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EpisodeCluster, ExperienceClusterMap, PatternsResponse } from '@/types';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: '認証が必要です' }, { status: 401 });
    }

    const { data: rawClusters, error: clustersError } = await supabase
      .from('episode_clusters')
      .select('*')
      .eq('user_id', user.id)
      .order('detected_count', { ascending: false });

    if (clustersError) {
      console.error('[API/patterns] SELECT clusters error:', clustersError);
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

    // Fetch recent mappings (last 20) with joined info
    const { data: rawMappings, error: mappingsError } = await supabase
      .from('experience_cluster_map')
      .select(
        `
        id,
        experience_id,
        cluster_id,
        confidence,
        reasoning,
        created_at,
        episode_clusters ( cluster_type, label ),
        experiences ( description )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(20);

    if (mappingsError) {
      console.error('[API/patterns] SELECT mappings error:', mappingsError);
      // Non-fatal: return clusters without mappings
    }

    const recentMappings: ExperienceClusterMap[] = (rawMappings ?? []).map((m) => {
      const clusterJoin = (m.episode_clusters as unknown) as
        | { cluster_type: string; label: string }
        | null;
      const expJoin = (m.experiences as unknown) as { description: string } | null;
      return {
        id: m.id,
        experienceId: m.experience_id,
        clusterId: m.cluster_id,
        confidence: m.confidence,
        reasoning: m.reasoning,
        createdAt: m.created_at,
        clusterType: clusterJoin?.cluster_type as EpisodeCluster['clusterType'] | undefined,
        clusterLabel: clusterJoin?.label,
        experienceDescription: expJoin?.description,
      };
    });

    return NextResponse.json({ clusters, recentMappings } satisfies PatternsResponse);
  } catch (err) {
    console.error('[API/patterns] GET unhandled error:', err);
    return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
