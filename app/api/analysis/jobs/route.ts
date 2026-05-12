import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createCreateAnalysisJobUseCase } from '@/container/createUseCases';
import { CloudflareAnalysisQueueProducer } from '@/infrastructure/jobs/CloudflareAnalysisQueueProducer';
import { ValidationError } from '@/core/errors/ValidationError';
import { AuthError } from '@/core/errors/AuthError';
import { handleError, checkBodySize } from '@/lib/apiHelpers';
import type { AnalysisQueueMessage } from '@/cloudflare-env';

interface CreateAnalysisJobRequest {
  mode: 'quick' | 'full_3months';
}

type CloudflareContextLike = {
  env: {
    ANALYSIS_QUEUE?: unknown;
  };
  ctx: {
    waitUntil: (promise: Promise<unknown>) => void;
  };
};

function isCloudflareContextLike(value: unknown): value is CloudflareContextLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const maybe = value as {
    env?: { ANALYSIS_QUEUE?: unknown };
    ctx?: { waitUntil?: unknown };
  };

  return (
    typeof maybe.env === 'object' &&
    maybe.env !== null &&
    typeof maybe.ctx === 'object' &&
    maybe.ctx !== null &&
    typeof maybe.ctx.waitUntil === 'function'
  );
}

function isQueueLike(value: unknown): value is Queue<AnalysisQueueMessage> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Queue<AnalysisQueueMessage>).send === 'function'
  );
}

async function enqueueAnalysisJob(
  queue: Queue<AnalysisQueueMessage>,
  jobId: string,
  userId: string,
  mode: 'quick' | 'full_3months',
): Promise<void> {
  const message: AnalysisQueueMessage = {
    jobId,
    userId,
    trigger: 'manual',
    mode,
  };

  const producer = new CloudflareAnalysisQueueProducer(queue);
  await producer.enqueue(message);
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError('認証が必要です');

    checkBodySize(request, 1024);
    let body: CreateAnalysisJobRequest;
    try {
      body = (await request.json()) as CreateAnalysisJobRequest;
    } catch {
      throw new ValidationError('Request bodyはJSONで指定してください');
    }

    const { mode } = body;
    if (!mode || !['quick', 'full_3months'].includes(mode)) {
      throw new ValidationError('modeはquickまたはfull_3monthsで指定してください');
    }

    const useCase = createCreateAnalysisJobUseCase(supabase);
    const jobId = await useCase.execute(user.id, { mode });

    // Get the job to return status
    const { data: job, error } = await supabase
      .from('analysis_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Failed to retrieve job: ${error.message}`);
    }

    const status = job?.status || 'pending';
    const isNewJob = job?.status === 'pending';

    // Try to enqueue to Cloudflare Queue
    let cfContext: Awaited<ReturnType<typeof getCloudflareContext>> | null = null;
    try {
      cfContext = await getCloudflareContext({ async: true });
    } catch {
      // Not in Cloudflare Worker context (local dev), skip queue enqueue
      console.warn('[analysis/jobs] Not in Cloudflare context, skipping queue enqueue');
    }

    if (isCloudflareContextLike(cfContext)) {
      const queue = cfContext.env.ANALYSIS_QUEUE;
      if (isQueueLike(queue)) {
        cfContext.ctx.waitUntil(
          enqueueAnalysisJob(queue, jobId, user.id, mode).catch((err) => {
            console.error('[analysis/jobs] Queue enqueue failed:', err);
          }),
        );
      } else {
        console.warn('[analysis/jobs] ANALYSIS_QUEUE binding is missing or invalid');
      }
    }

    return NextResponse.json({
      ok: true,
      jobId,
      status,
      mode,
      message: isNewJob ? '分析を開始しました' : '分析はすでに実行中です',
    });
  } catch (err) {
    return handleError(err);
  }
}
