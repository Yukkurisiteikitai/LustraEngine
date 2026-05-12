-- Allow authenticated users to create and manage their own analysis jobs.

CREATE POLICY analysis_jobs_insert_own ON analysis_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY analysis_jobs_update_own ON analysis_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
