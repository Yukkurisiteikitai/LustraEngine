import type {
  BigFiveScore, BigFiveFacet, AttachmentProfile,
  IdentityStatusRecord, ExperiencePsychologyAnalysis
} from '../entities/PsychologyProfile';

export interface IPsychologyRepository {
  // Big Five
  upsertBigFiveScore(score: Omit<BigFiveScore, 'updatedAt'>): Promise<void>;
  upsertBigFiveFacet(facet: BigFiveFacet): Promise<void>;
  getBigFiveScore(userId: string): Promise<BigFiveScore | null>;

  // 愛着プロファイル
  upsertAttachmentProfile(profile: AttachmentProfile): Promise<void>;
  getAttachmentProfile(userId: string): Promise<AttachmentProfile | null>;

  // アイデンティティステータス
  upsertIdentityStatus(record: IdentityStatusRecord): Promise<void>;
  getIdentityStatus(userId: string): Promise<IdentityStatusRecord[]>;

  // 経験の心理学分析結果を保存
  updateExperiencePsychologyAnalysis(
    experienceId: string,
    analysis: ExperiencePsychologyAnalysis
  ): Promise<void>;
}
