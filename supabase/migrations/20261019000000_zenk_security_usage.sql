ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text;

CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF COALESCE(auth.role(), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
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
CREATE TRIGGER protect_profile_billing_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing_fields();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, plan) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), 'free') ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('recordings', 'recordings', false, 26214400, ARRAY['audio/webm','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/mpeg']) ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400, allowed_mime_types = EXCLUDED.allowed_mime_types;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload own recordings') THEN CREATE POLICY "Users can upload own recordings" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='recordings' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can read own recordings') THEN CREATE POLICY "Users can read own recordings" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='recordings' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text); END IF;
END; $$;
CREATE INDEX IF NOT EXISTS meetings_user_id_idx ON public.meetings(user_id);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_meeting_id_idx ON public.tasks(meeting_id);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meetings_status_check' AND conrelid='public.meetings'::regclass) THEN ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check CHECK (status IN ('processing','recording','completed','ready','failed')) NOT VALID; END IF; END; $$;

CREATE TABLE IF NOT EXISTS public.usage (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, meeting_id uuid NOT NULL, period_start date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, meeting_id));
CREATE INDEX IF NOT EXISTS usage_user_period_idx ON public.usage(user_id, period_start);
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage FROM anon, authenticated; GRANT ALL ON public.usage TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_meeting_usage(p_user_id uuid,p_meeting_id uuid,p_period_start date,p_quota integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE used_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Only trusted server operations may reserve usage'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_period_start::text,0));
  IF EXISTS (SELECT 1 FROM public.usage WHERE user_id=p_user_id AND meeting_id=p_meeting_id) THEN RETURN true; END IF;
  SELECT count(*) INTO used_count FROM public.usage WHERE user_id=p_user_id AND period_start=p_period_start;
  IF used_count >= p_quota THEN RETURN false; END IF;
  INSERT INTO public.usage(user_id,meeting_id,period_start) VALUES(p_user_id,p_meeting_id,p_period_start) ON CONFLICT(user_id,meeting_id) DO NOTHING;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_meeting_usage(uuid,uuid,date,integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.reserve_meeting_usage(uuid,uuid,date,integer) TO service_role;
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events(event_id text PRIMARY KEY,event_type text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM anon,authenticated; GRANT ALL ON public.stripe_webhook_events TO service_role;
