-- READ ONLY. Run via project-scoped management API for pdtsjtzmuxggbxvypcis.
-- Stop if any of these assertions fail; do not repair by deleting user data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tasks t LEFT JOIN public.meetings m ON m.id=t.meeting_id WHERE m.id IS NULL OR t.user_id IS DISTINCT FROM m.user_id) THEN
    RAISE EXCEPTION 'Task ownership mismatch; investigate before deployment';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('meetings','tasks','profiles','usage') AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'RLS disabled; stop deployment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='recordings' AND public=false AND file_size_limit=26214400) THEN
    RAISE EXCEPTION 'Unexpected recordings bucket configuration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('meetings','tasks','profiles') AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Column ACLs need separate review';
  END IF;
END $$;
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
