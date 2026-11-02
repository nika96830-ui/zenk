BEGIN;
-- A durable admission record, not a lease: timeouts cannot prove the provider did
-- not accept a request. Never expire/reset automatically or cascade on row deletion.
CREATE SCHEMA IF NOT EXISTS zenk_internal;
REVOKE ALL ON SCHEMA zenk_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA zenk_internal TO service_role;
CREATE TABLE zenk_internal.meeting_processing_claims (
  meeting_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  audio_path text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE zenk_internal.meeting_processing_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zenk_internal.meeting_processing_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON zenk_internal.meeting_processing_claims TO service_role;

-- Historical audio may already have incurred inference costs. Conservatively seal
-- existing recordings; their past provider outcome cannot be reconstructed safely.
INSERT INTO zenk_internal.meeting_processing_claims (meeting_id, user_id, audio_path)
SELECT id, user_id, audio_path FROM public.meetings WHERE audio_path IS NOT NULL;

CREATE FUNCTION public.claim_meeting_processing(p_user_id uuid, p_meeting_id uuid, p_audio_path text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH claimed AS (
    INSERT INTO zenk_internal.meeting_processing_claims (meeting_id, user_id, audio_path)
    SELECT id, user_id, audio_path FROM public.meetings
    WHERE id = p_meeting_id AND user_id = p_user_id AND audio_path = p_audio_path
      AND status <> 'completed' AND transcript IS NULL
    ON CONFLICT (meeting_id) DO NOTHING
    RETURNING meeting_id
  ) SELECT EXISTS (SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_meeting_processing(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_meeting_processing(uuid, uuid, text) TO service_role;
COMMIT;
