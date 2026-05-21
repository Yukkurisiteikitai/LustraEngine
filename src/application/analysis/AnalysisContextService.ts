import type { SupabaseClient } from '@supabase/supabase-js';
import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { AnalysisJobMode } from '@/core/domains/analysis/AnalysisJob';
import type { ClusterData } from '@/core/domains/cluster/Cluster';
import type { ITraitHypothesisRepository } from '@/core/domains/trait/ITraitHypothesisRepository';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';

export interface AnalysisContext {
  mode: AnalysisJobMode;
  analysisEnabled: boolean;
  recentLogs: Array<{ id: string; description: string; domain: string; stressLevel: number; loggedAt: string }>;
  unprocessedLogs: Array<{ id: string; description: string; domain: string; stressLevel: number; loggedAt: string }>;
  threeMonthSummary?: Array<{ date: string; count: number; avgStress: number }>;
  activeHypotheses?: TraitHypothesisRecord[];
  previousPatterns?: ClusterData[];
}

/**
 * Constructs analysis context based on mode
 * - quick: recent 1 week of logs
 * - full_3months: 1 week logs + 3 month summary + previous traits/patterns
 * - daily: 1 week logs + 3 month summary + previous traits/patterns (for unprocessed logs)
 */
export class AnalysisContextService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly experienceRepo: IExperienceRepository,
    private readonly traitHypothesisRepo: ITraitHypothesisRepository,
  ) {}

  private readDomain(row: Record<string, unknown>): string {
    const domainsJoin = row.domains as { description?: string } | null | undefined;
    return (
      domainsJoin?.description ??
      (row.domain_description as string | null | undefined) ??
      (row.domain_id as string | null | undefined) ??
      ''
    );
  }

  async buildContext(userId: string, mode: AnalysisJobMode): Promise<AnalysisContext> {
    const { data: settings, error: settingsError } = await this.supabase
      .from('user_settings')
      .select('analysis_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsError) {
      throw new Error(`Failed to fetch user settings: ${settingsError.message}`);
    }

    const analysisEnabled = settings?.analysis_enabled !== false;
    if (!analysisEnabled) {
      return {
        mode,
        analysisEnabled: false,
        recentLogs: [],
        unprocessedLogs: [],
        activeHypotheses: [],
      };
    }

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Fetch recent logs (last 1 week)
    const { data: recentLogs, error: recentError } = await this.supabase
      .from('experiences')
      .select('id, description, stress_level, logged_at, domain_id, visibility, domains(description)')
      .eq('user_id', userId)
      .gte('logged_at', oneWeekAgo.toISOString())
      .is('soft_deleted_at', null)
      .eq('visibility', 'analysis_allowed')
      .order('logged_at', { ascending: false });

    if (recentError) {
      throw new Error(`Failed to fetch recent logs: ${recentError.message}`);
    }

    // Map to common format
    const mappedRecentLogs = (recentLogs || []).map((log: Record<string, unknown>) => ({
      id: log.id as string,
      description: log.description as string,
      domain: this.readDomain(log),
      stressLevel: log.stress_level as number,
      loggedAt: log.logged_at as string,
    }));

    const context: AnalysisContext = {
      mode,
      analysisEnabled: true,
      recentLogs: mappedRecentLogs,
      unprocessedLogs: [],
    };

    context.activeHypotheses = await this.traitHypothesisRepo.findActiveByUser(userId);

    // For quick mode, return just recent logs
    if (mode === 'quick') {
      return context;
    }

    // For full_3months and daily modes, fetch additional context

    // Fetch unprocessed logs
    const { data: unprocessedLogs, error: unprocessedError } = await this.supabase
      .from('experiences')
      .select('id, description, stress_level, logged_at, domain_id, visibility, domains(description)')
      .eq('user_id', userId)
      .is('processed_at', null)
      .is('soft_deleted_at', null)
      .eq('visibility', 'analysis_allowed')
      .order('logged_at', { ascending: false });

    if (unprocessedError) {
      throw new Error(`Failed to fetch unprocessed logs: ${unprocessedError.message}`);
    }

    context.unprocessedLogs = (unprocessedLogs || []).map((log: Record<string, unknown>) => ({
      id: log.id as string,
      description: log.description as string,
      domain: this.readDomain(log),
      stressLevel: log.stress_level as number,
      loggedAt: log.logged_at as string,
    }));

    // Fetch 3-month summary
    const { data: threeMonthLogs, error: threeMonthError } = await this.supabase
      .from('experiences')
      .select('logged_at, stress_level')
      .eq('user_id', userId)
      .is('soft_deleted_at', null)
      .eq('visibility', 'analysis_allowed')
      .gte('logged_at', threeMonthsAgo.toISOString())
      .lte('logged_at', now.toISOString());

    if (threeMonthError) {
      throw new Error(`Failed to fetch 3-month logs: ${threeMonthError.message}`);
    }

    // Build 3-month summary by date
    const summaryMap = new Map<string, { count: number; totalStress: number }>();
    (threeMonthLogs || []).forEach((log: Record<string, unknown>) => {
      const date = (log.logged_at as string).split('T')[0];
      const stress = log.stress_level as number;

      if (!summaryMap.has(date)) {
        summaryMap.set(date, { count: 0, totalStress: 0 });
      }
      const entry = summaryMap.get(date)!;
      entry.count += 1;
      entry.totalStress += stress;
    });

    context.threeMonthSummary = Array.from(summaryMap.entries()).map(([date, { count, totalStress }]) => ({
      date,
      count,
      avgStress: totalStress / count,
    }));

    // Fetch previous patterns (latest clusters)
    const { data: patterns, error: patternsError } = await this.supabase
      .from('episode_clusters')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (patternsError) {
      console.warn(`Failed to fetch patterns: ${patternsError.message}`);
    } else if (patterns) {
      context.previousPatterns = patterns;
    }

    return context;
  }
}
