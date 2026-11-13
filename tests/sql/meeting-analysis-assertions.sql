-- Verify additive arrays and check constraints without altering production data.
DO $$
DECLARE
  rows_count integer;
BEGIN
  SELECT count(*) INTO rows_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'meetings'
  AND column_name IN ('topics', 'decisions') AND data_type = 'ARRAY';
  IF rows_count <> 2 THEN RAISE EXCEPTION 'Missing structured analysis columns'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.meetings'::regclass
    AND conname = 'meetings_topics_no_null_items'
  ) THEN RAISE EXCEPTION 'Missing topics constraint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.meetings'::regclass
    AND conname = 'meetings_decisions_no_null_items'
  ) THEN RAISE EXCEPTION 'Missing decisions constraint'; END IF;
END $$;
