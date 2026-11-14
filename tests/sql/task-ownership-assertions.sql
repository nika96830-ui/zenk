-- Run after the ownership migration. Any failed assertion aborts CI.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.tasks;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed: owner A sees % tasks, expected 1', visible_count;
  END IF;

  INSERT INTO public.tasks (id, meeting_id, user_id, title)
  VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '11111111-1111-4111-8111-111111111111',
          'A new private task');

  BEGIN
    INSERT INTO public.tasks (id, meeting_id, user_id, title)
    VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            '11111111-1111-4111-8111-111111111111',
            'Cross-owner task');
    RAISE EXCEPTION 'Cross-owner task insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.tasks
       SET user_id = '22222222-2222-4222-8222-222222222222'
     WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    RAISE EXCEPTION 'Changing task owner unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  SELECT count(*) INTO visible_count FROM public.tasks;
  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two owner A tasks after valid insert, got %', visible_count;
  END IF;
END;
$$;
RESET ROLE;
SELECT 'PASS: owner-scoped task RLS and cross-owner write protections' AS result;
