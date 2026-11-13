-- Adds structured analysis fields without changing row ownership or API grants.
BEGIN;
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS decisions text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Avoid duplicate constraint failures when the migration has been applied manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meetings'::regclass AND conname = 'meetings_topics_no_null_items'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_topics_no_null_items CHECK (array_position(topics, NULL) IS NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meetings'::regclass AND conname = 'meetings_decisions_no_null_items'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_decisions_no_null_items CHECK (array_position(decisions, NULL) IS NULL);
  END IF;
END $$;
COMMIT;
