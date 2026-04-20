import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPsychologyRepository } from '@/core/ports/IPsychologyRepository';
import type {
  BigFiveScore, BigFiveFacet, AttachmentProfile,
  IdentityStatusRecord, ExperiencePsychologyAnalysis
} from '@/core/entities/PsychologyProfile';
import { InfrastructureError } from '@/core/errors/InfrastructureError';

export class SupabasePsychologyRepository implements IPsychologyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async upsertBigFiveScore(score: Omit<BigFiveScore, 'updatedAt'>): Promise<void> {
    const { error } = await this.supabase
      .from('big_five_scores')
      .upsert({
        user_id: score.userId,
        openness: score.openness ?? null,
        conscientiousness: score.conscientiousness ?? null,
        extraversion: score.extraversion ?? null,
        agreeableness: score.agreeableness ?? null,
        neuroticism: score.neuroticism ?? null,
        confidence: score.confidence,
        evidence_count: score.evidenceCount,
        apply_cultural_adjustment: score.applyCulturalAdjustment,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw new InfrastructureError('psychology:upsertBigFiveScore failed', error);
  }

  async upsertBigFiveFacet(facet: BigFiveFacet): Promise<void> {
    const { error } = await this.supabase
      .from('big_five_facets')
      .upsert({
        user_id: facet.userId,
        domain: facet.domain,
        facet_name: facet.facetName,
        score: facet.score ?? null,
        confidence: facet.confidence,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,domain,facet_name' });

    if (error) throw new InfrastructureError('psychology:upsertBigFiveFacet failed', error);
  }

  async getBigFiveScore(userId: string): Promise<BigFiveScore | null> {
    const { data, error } = await this.supabase
      .from('big_five_scores')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new InfrastructureError('psychology:getBigFiveScore failed', error);
    }
    if (!data) return null;

    return {
      userId: data.user_id as string,
      openness: data.openness as number | undefined,
      conscientiousness: data.conscientiousness as number | undefined,
      extraversion: data.extraversion as number | undefined,
      agreeableness: data.agreeableness as number | undefined,
      neuroticism: data.neuroticism as number | undefined,
      confidence: data.confidence as number,
      evidenceCount: data.evidence_count as number,
      applyCulturalAdjustment: data.apply_cultural_adjustment as boolean,
      updatedAt: data.updated_at as string,
    };
  }

  async upsertAttachmentProfile(profile: AttachmentProfile): Promise<void> {
    const { error } = await this.supabase
      .from('attachment_profile')
      .upsert({
        user_id: profile.userId,
        anxiety_score: profile.anxietyScore ?? null,
        avoidance_score: profile.avoidanceScore ?? null,
        style: profile.style ?? null,
        confidence: profile.confidence,
        evidence_count: profile.evidenceCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw new InfrastructureError('psychology:upsertAttachmentProfile failed', error);
  }

  async getAttachmentProfile(userId: string): Promise<AttachmentProfile | null> {
    const { data, error } = await this.supabase
      .from('attachment_profile')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new InfrastructureError('psychology:getAttachmentProfile failed', error);
    }
    if (!data) return null;

    return {
      userId: data.user_id as string,
      anxietyScore: data.anxiety_score as number | undefined,
      avoidanceScore: data.avoidance_score as number | undefined,
      style: data.style as AttachmentProfile['style'],
      confidence: data.confidence as number,
      evidenceCount: data.evidence_count as number,
    };
  }

  async upsertIdentityStatus(record: IdentityStatusRecord): Promise<void> {
    const { error } = await this.supabase
      .from('identity_status')
      .upsert({
        user_id: record.userId,
        domain: record.domain,
        exploration_score: record.explorationScore ?? null,
        commitment_score: record.commitmentScore ?? null,
        status: record.status ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,domain' });

    if (error) throw new InfrastructureError('psychology:upsertIdentityStatus failed', error);
  }

  async getIdentityStatus(userId: string): Promise<IdentityStatusRecord[]> {
    const { data, error } = await this.supabase
      .from('identity_status')
      .select('*')
      .eq('user_id', userId);

    if (error) throw new InfrastructureError('psychology:getIdentityStatus failed', error);

    return (data ?? []).map((row) => ({
      userId: row.user_id as string,
      domain: row.domain as IdentityStatusRecord['domain'],
      explorationScore: row.exploration_score as number | undefined,
      commitmentScore: row.commitment_score as number | undefined,
      status: row.status as IdentityStatusRecord['status'],
    }));
  }

  async updateExperiencePsychologyAnalysis(
    experienceId: string,
    analysis: ExperiencePsychologyAnalysis
  ): Promise<void> {
    const { error } = await this.supabase
      .from('experiences')
      .update({
        narrative_sequence: analysis.narrativeSequence ?? null,
        agency_score: analysis.agencyScore ?? null,
        communion_score: analysis.communionScore ?? null,
        attribution_locus: analysis.attributionLocus ?? null,
        attribution_stability: analysis.attributionStability ?? null,
        attribution_controllability: analysis.attributionControllability ?? null,
        cognitive_distortions: analysis.cognitiveDistortions,
        disclosure_difficulty: analysis.disclosureDifficulty ?? null,
        psychology_analyzed_at: new Date().toISOString(),
      })
      .eq('id', experienceId);

    if (error) throw new InfrastructureError('psychology:updateExperiencePsychologyAnalysis failed', error);
  }
}
