-- allow revising hypotheses that are in 'needs_review' status (held by user)
-- previously only 'active' was accepted, so hold → revise caused a 500 error
create or replace function revise_hypothesis_atomic(
  p_user_id uuid,
  p_prev_id uuid,
  p_new_row jsonb
) returns trait_hypothesis_history
language plpgsql security definer as $$
declare
  v_new_id uuid;
  v_result trait_hypothesis_history%rowtype;
begin
  v_new_id := coalesce((p_new_row->>'id')::uuid, gen_random_uuid());

  insert into trait_hypothesis_history (
    id, user_id, trait_key, hypothesis_label, hypothesis_text,
    score, confidence, uncertainty, evidence_ids, source_pattern_ids,
    model_name, model_version, prompt_version,
    status, supersedes_hypothesis_id, revised_from_id,
    source, user_correction, analysis_job_id
  ) values (
    v_new_id, p_user_id,
    p_new_row->>'trait_key', p_new_row->>'hypothesis_label', p_new_row->>'hypothesis_text',
    nullif(p_new_row->>'score','')::real,
    coalesce((p_new_row->>'confidence')::real, 0.1),
    coalesce((p_new_row->>'uncertainty')::real, 0.5),
    coalesce(p_new_row->'evidence_ids', '[]'::jsonb),
    coalesce(p_new_row->'source_pattern_ids', '[]'::jsonb),
    p_new_row->>'model_name', p_new_row->>'model_version', p_new_row->>'prompt_version',
    'active', p_prev_id, p_prev_id,
    coalesce(p_new_row->>'source', 'user_revision'),
    p_new_row->>'user_correction',
    nullif(p_new_row->>'analysis_job_id','')::uuid
  ) returning * into v_result;

  update trait_hypothesis_history
    set status = 'revised', superseded_by_hypothesis_id = v_new_id, updated_at = now()
    where id = p_prev_id and user_id = p_user_id
      and status in ('active', 'needs_review');

  if not found then
    raise exception 'revise_hypothesis_atomic: previous hypothesis not active or not owned';
  end if;

  return v_result;
end; $$;
