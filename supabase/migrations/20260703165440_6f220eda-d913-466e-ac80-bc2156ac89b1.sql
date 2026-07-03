-- 1. Extend jobs with source metadata (nullable so seeded demo rows stay valid)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_external_id_key
  ON public.jobs (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

-- 2. Track the last status we notified per application (idempotency for drag moves)
ALTER TABLE public.applied_jobs
  ADD COLUMN IF NOT EXISTS last_notified_status public.application_status;

-- 3. Dedup: which jobs have we already notified a user about via the agent
CREATE TABLE IF NOT EXISTS public.notified_jobs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id  UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score   INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

GRANT SELECT ON public.notified_jobs TO authenticated;
GRANT ALL    ON public.notified_jobs TO service_role;

ALTER TABLE public.notified_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notified jobs"
  ON public.notified_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Telegram audit log
CREATE TABLE IF NOT EXISTS public.telegram_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'match' | 'status_change' | 'test' | 'manual'
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  applied_id UUID REFERENCES public.applied_jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL,         -- 'sent' | 'failed' | 'skipped'
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  message TEXT NOT NULL,
  chat_id_masked TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_notifications_user_created_idx
  ON public.telegram_notifications (user_id, created_at DESC);

GRANT SELECT ON public.telegram_notifications TO authenticated;
GRANT ALL    ON public.telegram_notifications TO service_role;

ALTER TABLE public.telegram_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications log"
  ON public.telegram_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER telegram_notifications_set_updated_at
  BEFORE UPDATE ON public.telegram_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
