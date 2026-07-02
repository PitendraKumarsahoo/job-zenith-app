ALTER TABLE public.job_match_scores
  ADD COLUMN IF NOT EXISTS feedback smallint,
  ADD COLUMN IF NOT EXISTS feedback_note text;