-- Extend the synthetic ownership fixture only; never target a hosted database.
ALTER TABLE public.meetings ADD COLUMN audio_path text;
ALTER TABLE public.meetings ADD COLUMN status text NOT NULL DEFAULT 'processing';
ALTER TABLE public.meetings ADD COLUMN transcript text;
UPDATE public.meetings SET audio_path = user_id::text || '/historical.m4a';
ALTER ROLE service_role BYPASSRLS;
GRANT SELECT ON public.meetings TO service_role;
