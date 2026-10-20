-- Remove legacy payment data while keeping the server-side usage quota.
-- Review live subscription obligations and back up relevant data before applying.
DROP TRIGGER IF EXISTS protect_profile_billing_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_billing_fields();

-- Keep the plan field for compatibility with existing profiles while preventing
-- client users from elevating it to an old paid plan.
CREATE OR REPLACE FUNCTION public.protect_profile_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan := 'free';
    ELSIF NEW.plan IS DISTINCT FROM OLD.plan THEN
      RAISE EXCEPTION 'Plan can only be changed by trusted server operations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_plan ON public.profiles;
CREATE TRIGGER protect_profile_plan BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan();

UPDATE public.profiles SET plan = 'free' WHERE plan IS DISTINCT FROM 'free';
ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS subscription_status;
DROP TABLE IF EXISTS public.stripe_webhook_events;
