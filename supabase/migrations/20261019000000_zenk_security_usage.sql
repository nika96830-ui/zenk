-- Zenk: security + usage migration (reconciled with live project pdtsjtzmuxggbxvypcis on 2026-10-19).
-- Applied to Supabase on 2026-10-19 as migration version 20261019130659 "zenk_security_usage".
-- Idempotent and non-destructive: no DROP TABLE/COLUMN, no data deletion; touches only Zenk objects
-- (profiles, meetings, tasks, usage, stripe_webhook_events, recordings bucket/policies, handle_new_user).

-- 1. Billing columns on profiles (missing in the live DB; required by stripe-webhook/create-checkout/process-meeting).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text;

-- 2. Users cannot change their own billing fields. Only trusted DB roles may
--    (service_role used by Edge Functions, postgres/supabase_admin for migrations and SECURITY DEFINER triggers).
CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan := 'free'; NEW.stripe_customer_id := NULL; NEW.subscription_status := NULL;
    ELSIF NEW.plan IS DISTINCT FROM OLD.plan
      OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
      OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
      RAISE EXCEPTION 'Billing fields can only be changed by trusted server operations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_billing_fields ON public.profiles;
CREATE TRIGGER protect_profile_billing_fields BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing_fields();

-- 3. Profile auto-creation on signup (keeps the existing avatar_url behaviour, adds plan='free').
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, plan)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'avatar_url', 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END; $$;

-- 4. Private recordings bucket, 25 MiB, audio only. Owner-only policies on {uid}/... already exist
--    ("Users upload/read/update/delete own recordings"); create them only if missing.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'recordings', 'recordings', false, 26214400,
       ARRAY['audio/webm','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/mpeg']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'recordings');
UPDATE storage.buckets
   SET public = false, file_size_limit = 26214400,
       allowed_mime_types = ARRAY['audio/webm','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/mpeg']
 WHERE id = 'recordings';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='INSERT' AND with_check LIKE '%''recordings''%') THEN
    CREATE POLICY "Users upload own recordings" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'recordings' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND qual LIKE '%''recordings''%') THEN
    CREATE POLICY "Users read own recordings" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND qual LIKE '%''recordings''%') THEN
    CREATE POLICY "Users delete own recordings" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  END IF;
END; $$;

-- 5. Indexes and meeting status check (NOT VALID: existing rows are not re-checked).
CREATE INDEX IF NOT EXISTS meetings_user_id_idx ON public.meetings(user_id);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_meeting_id_idx ON public.tasks(meeting_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_status_check' AND conrelid = 'public.meetings'::regclass) THEN
    ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check
      CHECK (status IN ('processing','recording','completed','ready','failed')) NOT VALID;
  END IF;
END; $$;

-- 6. Monthly AI usage quota (server-side only).
CREATE TABLE IF NOT EXISTS public.usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL,
  period_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, meeting_id)
);
CREATE INDEX IF NOT EXISTS usage_user_period_idx ON public.usage(user_id, period_start);
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage FROM anon, authenticated;
GRANT ALL ON public.usage TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_meeting_usage(p_user_id uuid, p_meeting_id uuid, p_period_start date, p_quota integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE used_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only trusted server operations may reserve usage';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || p_period_start::text, 0));
  IF EXISTS (SELECT 1 FROM public.usage WHERE user_id = p_user_id AND meeting_id = p_meeting_id) THEN RETURN true; END IF;
  SELECT count(*) INTO used_count FROM public.usage WHERE user_id = p_user_id AND period_start = p_period_start;
  IF used_count >= p_quota THEN RETURN false; END IF;
  INSERT INTO public.usage (user_id, meeting_id, period_start) VALUES (p_user_id, p_meeting_id, p_period_start)
  ON CONFLICT (user_id, meeting_id) DO NOTHING;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_meeting_usage(uuid, uuid, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_meeting_usage(uuid, uuid, date, integer) TO service_role;

-- 7. Stripe webhook idempotency log (server-side only).
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;
