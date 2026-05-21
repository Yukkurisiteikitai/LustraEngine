import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createExportUserDataUseCase } from '@/container/createUseCases';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';
import { createRepositories } from '@/container/createRepositories';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { userSettings } = createRepositories(supabase);
    const settings = await userSettings.ensureDefaultByUser(user.id);
    if (!settings.dataExportEnabled) {
      return NextResponse.json(
        { ok: false, message: 'データエクスポートは設定で無効です' },
        { status: 403 },
      );
    }

    const useCase = createExportUserDataUseCase(supabase);
    const payload = await useCase.execute(user.id);
    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': `attachment; filename="ylm-export-${user.id}.json"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
