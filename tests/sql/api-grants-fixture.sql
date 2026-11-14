-- Isolated PostgreSQL fixture with synthetic roles/tables only.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.meetings (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.tasks (id uuid PRIMARY KEY, user_id uuid NOT NULL, meeting_id uuid NOT NULL);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Reproduce the overly broad legacy Data API grants found during read-only audit.
GRANT ALL ON TABLE public.meetings, public.profiles, public.tasks TO PUBLIC, anon, authenticated, service_role;
