-- Ensure every task belongs to the same user as its parent meeting.
-- Additive and non-destructive: this does not delete or rewrite user data.
CREATE OR REPLACE FUNCTION public.enforce_task_meeting_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  meeting_owner uuid;
BEGIN
  SELECT m.user_id
    INTO meeting_owner
    FROM public.meetings AS m
   WHERE m.id = NEW.meeting_id;

  IF meeting_owner IS NULL OR meeting_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'Task owner must match meeting owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enforce_meeting_owner ON public.tasks;
CREATE TRIGGER tasks_enforce_meeting_owner
BEFORE INSERT OR UPDATE OF meeting_id, user_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_meeting_owner();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tasks" ON public.tasks;
CREATE POLICY "Users manage own tasks"
ON public.tasks
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
      FROM public.meetings AS m
     WHERE m.id = meeting_id
       AND m.user_id = (SELECT auth.uid())
  )
);
