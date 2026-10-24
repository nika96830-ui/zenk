-- Retire Stripe integration without deleting historical billing data.
-- No Stripe services are called by this migration or enabled by this project.
-- Preserve legacy columns, webhook event records, and existing plan values: a public
-- launch must not erase customer/payment history or silently rewrite entitlements.
-- A separate, explicitly approved archival/removal migration is required if this data
-- is ever to be deleted after legal and business review.

-- Replace the old billing-field guard with a plan guard. The app may keep displaying
-- existing plan values, but authenticated users cannot elevate or change their plan.
DROP TRIGGER IF EXISTS protect_profile_billing_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_billing_fields();

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

-- Intentionally retain stripe_customer_id, subscription_status, and
-- stripe_webhook_events as inert legacy data. No Stripe integration is configured.
