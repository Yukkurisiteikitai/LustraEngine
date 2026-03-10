import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createThreadUseCase, createGetThreadHistoryUseCase } from '@/container/createUseCases';
import { AuthError } from '@/core/errors/AuthError';
import { ValidationError } from '@/core/errors/ValidationError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    const useCase = createGetThreadHistoryUseCase(supabase);
    const threads = await useCase.getThreads(user.id);

    return NextResponse.json({ threads });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(req, 4 * 1024);
    let title: string | undefined;
    try {
      const body = (await req.json()) as { title?: string };
      title = body.title;
    } catch {
      throw new ValidationError('title-JSONの形式が不正です。');
    }

    const useCase = createThreadUseCase(supabase);
    const thread = await useCase.execute(user.id, title);

    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
