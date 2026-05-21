-- Allow review/stale states for trait hypotheses after evidence deletion/exclusion.

ALTER TABLE trait_hypothesis_history
  DROP CONSTRAINT IF EXISTS trait_hypothesis_history_status_check;

ALTER TABLE trait_hypothesis_history
  ADD CONSTRAINT trait_hypothesis_history_status_check
    CHECK (
      status IN (
        'active',
        'revised',
        'rejected',
        'archived',
        'needs_review',
        'stale_due_to_evidence_deletion'
      )
    );
