import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createGetThreadHistoryUseCase } from '@/container/createUseCases';
import { AuthError } from '@/core/errors/AuthError';
import { handleError } from '@/lib/apiHelpers';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const { threadId } = await params;
    const useCase = createGetThreadHistoryUseCase(supabase);
    const messages = await useCase.getMessages(threadId);

    return NextResponse.json({ messages });
  } catch (err) {
    return handleError(err);
  }
}
