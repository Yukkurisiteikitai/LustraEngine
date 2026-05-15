import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
import { buildUserModelSnapshot } from '@/application/mappers/UserModelSnapshotMapper';
import { buildFallbackUserSettings } from '@/core/domains/user-settings/UserSettings';
import type { TraitHypothesisRecord } from '@/core/domains/trait/TraitHypothesis';
import type { AttachmentProfile, BigFiveScore, IdentityStatusRecord } from '@/core/entities/PsychologyProfile';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { psychology, traitHypothesis } = createRepositories(supabase);
    const { userSettings } = createRepositories(supabase);

    let data: TraitHypothesisRecord[] = [];
    let bigFive: BigFiveScore | null = null;
    let attachment: AttachmentProfile | null = null;
    let identityStatus: IdentityStatusRecord[] = [];
    let settings = buildFallbackUserSettings(user.id);
    try {
      settings = await userSettings.ensureDefaultByUser(user.id);
    } catch (error) {
      console.error('persona_api_settings_load_failed', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const allowSnapshotGeneration = settings.allowSnapshotGeneration ?? settings.allowModelSnapshotGeneration;

    if (!allowSnapshotGeneration) {
      const snapshot = buildUserModelSnapshot(user.id, [], {
        disabledMessage: 'ユーザーモデル要約の生成は無効です。設定から有効化すると仮説要約を表示できます。',
      });
      return NextResponse.json({
        snapshot,
        bigFive: null,
        attachment: null,
        identityStatus: [],
        snapshotGenerationEnabled: false,
        allowChatFallbackDraft: settings.allowChatFallbackDraft,
      });
    }

    try {
      data = await traitHypothesis.findActiveByUser(user.id);
    } catch (error) {
      console.error('persona_api_trait_hypothesis_failed', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      [bigFive, attachment, identityStatus] = await Promise.all([
        psychology.getBigFiveScore(user.id),
        psychology.getAttachmentProfile(user.id),
        psychology.getIdentityStatus(user.id),
      ]);
    } catch (error) {
      console.error('persona_api_psychology_failed', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const snapshot = buildUserModelSnapshot(user.id, data);

    return NextResponse.json({
      snapshot,
      bigFive,
      attachment,
      identityStatus,
      snapshotGenerationEnabled: true,
      allowChatFallbackDraft: settings.allowChatFallbackDraft,
    });
  } catch (err) {
    return handleError(err);
  }
}
