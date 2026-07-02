-- 1. Create private credentials table (server-only)
CREATE TABLE IF NOT EXISTS public.user_telegram_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token text NOT NULL,
  chat_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only service_role can access. No anon/authenticated grants — the Data API
-- cannot see this table. All access must go through server functions using
-- the service role client.
GRANT ALL ON public.user_telegram_credentials TO service_role;

ALTER TABLE public.user_telegram_credentials ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: even if someone gained the anon/authenticated
-- role they still could not read this table.

CREATE TRIGGER user_telegram_credentials_set_updated_at
  BEFORE UPDATE ON public.user_telegram_credentials
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Migrate existing credentials
INSERT INTO public.user_telegram_credentials (user_id, bot_token, chat_id)
SELECT user_id, telegram_bot_token, telegram_chat_id
FROM public.user_settings
WHERE telegram_bot_token IS NOT NULL
  AND telegram_bot_token <> ''
  AND telegram_chat_id IS NOT NULL
  AND telegram_chat_id <> ''
ON CONFLICT (user_id) DO NOTHING;

-- 3. Drop sensitive columns from the client-readable table
ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS telegram_bot_token,
  DROP COLUMN IF EXISTS telegram_chat_id;