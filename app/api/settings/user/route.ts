import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createRepositories } from '@/container/createRepositories';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { handleError } from '@/lib/apiHelpers';
import type {
  UserSettingsData,
  UserSettingsUpdateInput,
} from '@/core/domains/user-settings/UserSettings';
import type { EvidenceVisibility } from '@/types';

type UserSettingsResponse = {
  settings: UserSettingsData;
};

function toResponse(settings: UserSettingsData): UserSettingsData {
  return settings;
}

function isEvidenceVisibility(value: unknown): value is EvidenceVisibility {
  return value === 'private' || value === 'analysis_allowed' || value === 'excluded';
}

function parseUpdate(body: Record<string, unknown>): UserSettingsUpdateInput {
  const update: UserSettingsUpdateInput = {};

  if ('analysisEnabled' in body) {
    if (typeof body.analysisEnabled !== 'boolean') throw new ValidationError('analysisEnabled は boolean で指定してください');
    update.analysisEnabled = body.analysisEnabled;
  }
  if ('includeSensitiveEvidence' in body) {
    if (typeof body.includeSensitiveEvidence !== 'boolean') throw new ValidationError('includeSensitiveEvidence は boolean で指定してください');
    update.includeSensitiveEvidence = body.includeSensitiveEvidence;
  }
  if ('defaultEvidenceVisibility' in body) {
    if (!isEvidenceVisibility(body.defaultEvidenceVisibility)) {
      throw new ValidationError('defaultEvidenceVisibility は private / analysis_allowed / excluded のいずれかで指定してください');
    }
    update.defaultEvidenceVisibility = body.defaultEvidenceVisibility;
  }
  if ('allowChatFallbackDraft' in body) {
    if (typeof body.allowChatFallbackDraft !== 'boolean') throw new ValidationError('allowChatFallbackDraft は boolean で指定してください');
    update.allowChatFallbackDraft = body.allowChatFallbackDraft;
  }
  if ('allowSnapshotGeneration' in body) {
    if (typeof body.allowSnapshotGeneration !== 'boolean') throw new ValidationError('allowSnapshotGeneration は boolean で指定してください');
    update.allowSnapshotGeneration = body.allowSnapshotGeneration;
  }
  if ('allowChatHistorySave' in body) {
    if (typeof body.allowChatHistorySave !== 'boolean') throw new ValidationError('allowChatHistorySave は boolean で指定してください');
    update.allowChatHistorySave = body.allowChatHistorySave;
  }
  if ('requireConfirmationBeforeReanalysis' in body) {
    if (typeof body.requireConfirmationBeforeReanalysis !== 'boolean') {
      throw new ValidationError('requireConfirmationBeforeReanalysis は boolean で指定してください');
    }
    update.requireConfirmationBeforeReanalysis = body.requireConfirmationBeforeReanalysis;
  }
  if ('allowModelSnapshotGeneration' in body) {
    if (typeof body.allowModelSnapshotGeneration !== 'boolean') throw new ValidationError('allowModelSnapshotGeneration は boolean で指定してください');
    update.allowModelSnapshotGeneration = body.allowModelSnapshotGeneration;
  }
  if ('dataExportEnabled' in body) {
    if (typeof body.dataExportEnabled !== 'boolean') throw new ValidationError('dataExportEnabled は boolean で指定してください');
    update.dataExportEnabled = body.dataExportEnabled;
  }
  if ('dataDeletionRequestedAt' in body) {
    if (body.dataDeletionRequestedAt !== null && typeof body.dataDeletionRequestedAt !== 'string') {
      throw new ValidationError('dataDeletionRequestedAt は string または null で指定してください');
    }
    update.dataDeletionRequestedAt = body.dataDeletionRequestedAt;
  }

  return update;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { userSettings } = createRepositories(supabase);
    const settings = await userSettings.ensureDefaultByUser(user.id);
    return NextResponse.json({ settings: toResponse(settings) } satisfies UserSettingsResponse);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      throw new ValidationError('user settings のJSONが不正です');
    }

    const update = parseUpdate(body);
    const { userSettings } = createRepositories(supabase);
    const settings = await userSettings.updateByUser(user.id, update);
    return NextResponse.json({ settings: toResponse(settings) } satisfies UserSettingsResponse);
  } catch (error) {
    return handleError(error);
  }
}
