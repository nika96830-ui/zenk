DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['meetings', 'profiles', 'tasks'] LOOP
    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'anon retains Data API privileges on public.%', table_name;
    END IF;

    IF has_table_privilege('PUBLIC', format('public.%I', table_name), 'SELECT') THEN
      RAISE EXCEPTION 'PUBLIC retains SELECT on public.%', table_name;
    END IF;

    IF NOT has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'authenticated CRUD grants missing on public.%', table_name;
    END IF;

    IF NOT has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'service_role grants missing on public.%', table_name;
    END IF;
  END LOOP;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.meetings'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tasks'::regclass) THEN
    RAISE EXCEPTION 'RLS was disabled by the grants migration';
  END IF;
END $$;
