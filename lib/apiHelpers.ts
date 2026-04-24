import { NextResponse } from 'next/server';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { LLMError } from '@/core/errors/LLMError';
import { InfrastructureError } from '@/core/errors/InfrastructureError';
import { RateLimitError } from '@/core/errors/RateLimitError';
import { LLMConcurrencyError } from '@/core/errors/LLMConcurrencyError';
import { ConcurrencyError } from '@/core/errors/ConcurrencyError';

export function checkBodySize(req: Request, maxBytes: number): void {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new ValidationError(
      `リクエストボディが大きすぎます（最大 ${Math.round(maxBytes / 1024)}KB）`,
    );
  }
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof RateLimitError) {
    console.error('api:rate_limit_exceeded', {
      ...err.context,
      message: err.message,
      stack: err.stack,
    });
    const res = NextResponse.json({ message: err.message }, { status: 429 });
    res.headers.set('Retry-After', String(err.context.retryAfterSeconds));
    return res;
  }
  if (err instanceof LLMConcurrencyError) {
    console.error('api:llm_concurrency_exhausted', {
      ...err.context,
      message: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ message: err.message }, { status: 503 });
  }
  if (err instanceof ConcurrencyError) {
    return NextResponse.json({ message: err.message }, { status: 409 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }
  if (err instanceof AuthError) {
    return NextResponse.json({ message: err.message }, { status: 401 });
  }
  if (err instanceof LLMError) {
    console.error('api:llm_error_502', {
      message: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ message: err.message }, { status: 502 });
  }
  if (err instanceof InfrastructureError) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
  console.error('unhandled_error', {
    err: String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return NextResponse.json({ message: '予期しないエラーが発生しました' }, { status: 500 });
}
