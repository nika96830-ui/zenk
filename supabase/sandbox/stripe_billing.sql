-- Apply only to zang-test, after the public.apply_subscription_event RPC exists.
BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.apply_subscription_event(text,text,text,uuid,text,text,timestamp with time zone,timestamp with time zone,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION 'The sandbox subscription-event RPC is required';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.stripe_sandbox_customers (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  checkout_locked_until timestamptz,
  state_observed_at timestamptz
);
ALTER TABLE public.stripe_sandbox_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_sandbox_customers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_sandbox_customers TO service_role;

CREATE OR REPLACE FUNCTION public.claim_stripe_sandbox_checkout(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_sandbox_customers
     SET checkout_locked_until = now() + interval '35 minutes'
   WHERE user_id = p_user_id
     AND (checkout_locked_until IS NULL OR checkout_locked_until <= now());
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_sandbox_state(
  p_customer_id text, p_event_id text, p_event_type text, p_observed_at timestamptz,
  p_plan text, p_status text, p_period_start timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE binding public.stripe_sandbox_customers%ROWTYPE;
BEGIN
  SELECT * INTO binding FROM public.stripe_sandbox_customers
    WHERE stripe_customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR p_observed_at IS NULL OR p_observed_at <= binding.state_observed_at THEN
    RETURN false;
  END IF;

  IF NOT public.apply_subscription_event(
    'stripe_sandbox', p_event_id, p_event_type, binding.user_id, p_plan, p_status,
    p_period_start, p_period_end, p_cancel_at_period_end
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.stripe_sandbox_customers SET state_observed_at = p_observed_at
    WHERE user_id = binding.user_id;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_sandbox_checkout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_sandbox_checkout(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.apply_stripe_sandbox_state(text,text,text,timestamptz,text,text,timestamptz,timestamptz,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_sandbox_state(text,text,text,timestamptz,text,text,timestamptz,timestamptz,boolean)
  TO service_role;

COMMIT;
