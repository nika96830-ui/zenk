-- Explicit least-privilege grants for ZANG user-facing tables.
-- RLS remains enabled; grants determine whether a role can reach a table at all.
-- This migration is additive and does not modify or delete user data.
REVOKE ALL ON TABLE public.meetings, public.profiles, public.tasks FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.meetings, public.profiles, public.tasks
  TO authenticated;

GRANT ALL
  ON TABLE public.meetings, public.profiles, public.tasks
  TO service_role;
