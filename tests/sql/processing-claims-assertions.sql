DO $$
BEGIN
  IF has_function_privilege('anon', 'public.claim_meeting_processing(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_meeting_processing(uuid,uuid,text)', 'EXECUTE')
    OR has_schema_privilege('authenticated', 'zenk_internal', 'USAGE')
    OR has_table_privilege('authenticated', 'zenk_internal.meeting_processing_claims', 'INSERT')
    OR has_table_privilege('service_role', 'zenk_internal.meeting_processing_claims', 'DELETE')
    OR has_table_privilege('service_role', 'zenk_internal.meeting_processing_claims', 'UPDATE') THEN
    RAISE EXCEPTION 'Claim ACLs allow bypass or reset';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='zenk_internal.meeting_processing_claims'::regclass) THEN
    RAISE EXCEPTION 'Missing claim RLS';
  END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
  IF public.claim_meeting_processing('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111/historical.m4a') THEN
    RAISE EXCEPTION 'Historical audio was not sealed';
  END IF;
END $$;
RESET ROLE;
INSERT INTO public.meetings(id,user_id,title,audio_path) VALUES
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','New synthetic meeting','11111111-1111-4111-8111-111111111111/new.m4a');
SET ROLE service_role;
DO $$ BEGIN
  IF public.claim_meeting_processing('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111/new.m4a')
    OR public.claim_meeting_processing('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','other.m4a') THEN
    RAISE EXCEPTION 'Wrong owner/path admitted';
  END IF;
  IF NOT public.claim_meeting_processing('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111/new.m4a') THEN
    RAISE EXCEPTION 'First valid claim rejected';
  END IF;
END $$;
RESET ROLE;
DELETE FROM public.meetings WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
INSERT INTO public.meetings(id,user_id,title,audio_path,status) VALUES
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','Recreated synthetic meeting','11111111-1111-4111-8111-111111111111/new.m4a','failed');
SET ROLE service_role;
DO $$ BEGIN
  IF public.claim_meeting_processing('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111/new.m4a') THEN
    RAISE EXCEPTION 'Delete/recreate or status reset bypassed claim';
  END IF;
END $$;
RESET ROLE;
