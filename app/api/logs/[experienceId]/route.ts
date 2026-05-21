import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createManageExperienceDispositionUseCase } from '@/container/createUseCases';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';

interface DispositionRequestBody {
  action: 'soft_delete' | 'exclude';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ experienceId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { experienceId } = await params;
    if (!experienceId) {
      throw new ValidationError('experienceIdが必要です');
    }

    checkBodySize(request, 4 * 1024);
    let body: DispositionRequestBody;
    try {
      body = (await request.json()) as DispositionRequestBody;
    } catch {
      throw new ValidationError('DispositionRequestBodyのJSONが不正です');
    }

    if (body.action !== 'soft_delete' && body.action !== 'exclude') {
      throw new ValidationError('actionはsoft_deleteまたはexcludeで指定してください');
    }

    const useCase = createManageExperienceDispositionUseCase(supabase);
    const result = await useCase.execute(user.id, [experienceId], body.action);
    return NextResponse.json({
      ok: true,
      action: result.action,
      updatedCount: result.updatedCount,
      affectedHypothesisCount: result.affectedHypothesisCount,
    });
  } catch (error) {
    return handleError(error);
  }
}
