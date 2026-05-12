/**
 * Custom worker entry point for Cloudflare Workers
 * Wraps the generated OpenNext worker to add Queue and Scheduled handlers
 * 
 * This file must be listed as the `main` entry in wrangler.jsonc instead of `.open-next/worker.js`
 */

import { createClient } from '@supabase/supabase-js';
import type { AnalysisQueueMessage } from './cloudflare-env';
import { AnalysisJobConsumer } from '@/infrastructure/jobs/AnalysisJobConsumer';
import { DailyAnalysisScheduler } from '@/infrastructure/jobs/DailyAnalysisScheduler';
import { CloudflareAnalysisQueueProducer } from '@/infrastructure/jobs/CloudflareAnalysisQueueProducer';
import { createRepositories } from '@/container/createRepositories';
import { createWorkerLLM } from '@/infrastructure/llm/createWorkerLLM';
import { logger } from '@/infrastructure/observability/logger';

// Import the generated OpenNext worker
// Note: This is a relative import that will be resolved at build time
const openNextWorker = require('./.open-next/worker.js');

/**
 * Initialize Supabase service role client for worker context
 */
function createServiceRoleClient(env: CloudflareEnv) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[worker] Missing Supabase environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Fetch handler: delegates to OpenNext
 */
async function handleFetch(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  return openNextWorker.fetch(request, env, ctx);
}

/**
 * Queue consumer handler: processes analysis jobs from the queue
 */
async function handleQueue(
  batch: MessageBatch,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  const typedBatch = batch as MessageBatch<AnalysisQueueMessage>;
  console.log(`[Queue] Received ${typedBatch.messages.length} messages`);

  // Initialize service role client for worker
  const supabase = createServiceRoleClient(env);
  const { experience, clusterCommand, clusterQuery, trait, persona, psychology, llmSettings } =
    createRepositories(supabase);

  for (const message of typedBatch.messages) {
    const { jobId, userId, trigger, mode } = message.body;

    try {
      console.log(`[Queue] Processing job: ${jobId} for user: ${userId} (${mode})`);

      // Create consumer instance
      const consumer = new AnalysisJobConsumer(
        supabase,
        experience,
        clusterCommand,
        clusterQuery,
        trait,
        persona,
        psychology,
        (userId: string) => createWorkerLLM(env, userId, llmSettings),
      );

      // Process the message
      await consumer.process(message.body as AnalysisQueueMessage);
      console.log(`[Queue] Job ${jobId} completed successfully`);
      message.ack();
    } catch (error) {
      console.error(`[Queue] Error processing job ${message.body.jobId}:`, error);
      // Don't ack on error; message will be retried based on wrangler.jsonc max_retries
      // If retries exceed max_retries, it goes to dead letter queue
      throw error; // Re-throw to signal to Cloudflare that this batch should retry
    }
  }
}

/**
 * Scheduled handler: runs daily analysis batch
 */
async function handleScheduled(
  controller: ScheduledController,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  console.log('[Scheduled] Daily analysis batch triggered');

  try {
    // Initialize service role client for worker
    const supabase = createServiceRoleClient(env);

    // Create queue producer
    const queueProducer = new CloudflareAnalysisQueueProducer(env.ANALYSIS_QUEUE);

    // Create and run scheduler
    const scheduler = new DailyAnalysisScheduler(supabase, queueProducer);
    const result = await scheduler.run();

    console.log(
      `[Scheduled] Daily batch completed: ${result.jobsCreated} jobs created, ${result.usersProcessed} users processed`,
    );

    if (result.errors.length > 0) {
      console.warn('[Scheduled] Errors during daily batch:', result.errors);
    }
  } catch (error) {
    console.error('[Scheduled] Daily batch failed:', error);
    throw error;
  }
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env, ctx);
  },

  async queue(
    batch: MessageBatch,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    return handleQueue(batch, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    return handleScheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
