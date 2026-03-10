import { NextResponse } from 'next/server';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { LLMError } from '@/core/errors/LLMError';
import { InfrastructureError } from '@/core/errors/InfrastructureError';
import { logger } from '@/infrastructure/observability/logger';

export function checkBodySize(req: Request, maxBytes: number): void {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new ValidationError(
      `リクエストボディが大きすぎます（最大 ${Math.round(maxBytes / 1024)}KB）`,
    );
  }
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ValidationError) {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }
  if (err instanceof AuthError) {
    return NextResponse.json({ message: err.message }, { status: 401 });
  }
  if (err instanceof LLMError) {
    return NextResponse.json({ message: err.message }, { status: 502 });
  }
  if (err instanceof InfrastructureError) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
  logger.error('unhandled_error', { err: String(err) });
  return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
}
