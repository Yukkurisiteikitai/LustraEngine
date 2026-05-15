import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisQueueMessage } from '@/cloudflare-env';
import type { IAnalysisQueuePort } from '@/application/ports/IAnalysisQueuePort';

/**
 * Daily batch scheduler for analysis jobs
 * Runs at scheduled interval (typically once per day at 00:00 UTC)
 * 
 * Creates daily analysis jobs for all users with unprocessed experiences
 */
export class DailyAnalysisScheduler {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly queueProducer: IAnalysisQueuePort,
  ) {}

  async run(): Promise<{ jobsCreated: number; usersProcessed: number; errors: string[] }> {
    const errors: string[] = [];
    let jobsCreated = 0;
    let usersProcessed = 0;

    try {
      // Step 1: Find all users with unprocessed experiences
      const { data: unprocessedExperiences, error: queryError } = await this.supabase
        .from('experiences')
        .select('user_id')
        .is('processed_at', null)
        .is('soft_deleted_at', null)
        .eq('visibility', 'analysis_allowed')
        .order('user_id');

      if (queryError) {
        throw new Error(`Failed to query unprocessed experiences: ${queryError.message}`);
      }

      // Get unique user IDs
      const userIds = Array.from(new Set((unprocessedExperiences || []).map((e: Record<string, unknown>) => e.user_id as string)));
      console.log(`[DailyScheduler] Found ${userIds.length} users with unprocessed experiences`);

      // Step 2: For each user, create or get active daily job
      const today = new Date().toISOString().split('T')[0];

      for (const userId of userIds) {
        try {
          const { data: settings, error: settingsError } = await this.supabase
            .from('user_settings')
            .select('analysis_enabled')
            .eq('user_id', userId)
            .maybeSingle();

          if (settingsError) {
            errors.push(`Failed to check user settings for user ${userId}: ${settingsError.message}`);
            continue;
          }

          if (settings?.analysis_enabled === false) {
            console.log(`[DailyScheduler] Analysis disabled for user ${userId}; skipping`);
            usersProcessed += 1;
            continue;
          }

          const idempotencyKey = `analysis:${userId}:daily:${today}`;

          // Check if active daily job exists
          const { data: existingJobs, error: checkError } = await this.supabase
            .from('analysis_jobs')
            .select('id')
            .eq('user_id', userId)
            .eq('job_type', 'analysis')
            .eq('mode', 'daily')
            .in('status', ['pending', 'running'])
            .limit(1);

          if (checkError) {
            errors.push(`Failed to check existing job for user ${userId}: ${checkError.message}`);
            continue;
          }

          if (existingJobs && existingJobs.length > 0) {
            console.log(`[DailyScheduler] Active daily job already exists for user ${userId}`);
            usersProcessed += 1;
            continue;
          }

          // Create new job
          const { data: newJob, error: insertError } = await this.supabase
            .from('analysis_jobs')
            .insert([
              {
                user_id: userId,
                job_type: 'analysis',
                trigger: 'daily',
                mode: 'daily',
                priority: 'normal',
                status: 'pending',
                idempotency_key: idempotencyKey,
                created_at: new Date().toISOString(),
              },
            ])
            .select()
            .single();

          if (insertError) {
            // Might be idempotency key conflict, which is OK
            if (insertError.code === '23505') {
              console.log(`[DailyScheduler] Idempotency conflict for user ${userId} (expected)`);
            } else {
              errors.push(`Failed to create job for user ${userId}: ${insertError.message}`);
              continue;
            }
          } else if (newJob) {
            // Enqueue message
            try {
              const message: AnalysisQueueMessage = {
                jobId: newJob.id as string,
                userId,
                trigger: 'daily',
                mode: 'daily',
              };
              await this.queueProducer.enqueue(message);
              console.log(`[DailyScheduler] Enqueued daily job for user ${userId}`);
              jobsCreated += 1;
            } catch (enqueueError) {
              errors.push(`Failed to enqueue job for user ${userId}: ${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`);
            }
          }

          usersProcessed += 1;
        } catch (err) {
          errors.push(`Error processing user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      console.log(`[DailyScheduler] Completed: ${jobsCreated} jobs created, ${usersProcessed} users processed, ${errors.length} errors`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[DailyScheduler] Fatal error:`, err);
      errors.push(`Fatal error: ${msg}`);
    }

    return { jobsCreated, usersProcessed, errors };
  }
}
