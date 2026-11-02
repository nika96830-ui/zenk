# One admission per meeting

PR #18 adds `20261102130115_meeting_processing_claim.sql` and updates `process-meeting`.

After JWT, owner/path/file validation and quota reservation, the service role calls `claim_meeting_processing`. A unique key on the meeting UUID admits exactly one transaction. The function checks owner, audio path and that the meeting is not already completed/transcribed. All data/audio operations in the Edge Function still use caller RLS; only quota and admission use the service role.

Claims live in an unexposed schema, with RLS and no browser privileges. The RPC is SECURITY INVOKER and service-role-only. Application service access has INSERT/SELECT, no UPDATE/DELETE, on the claim table. Claims do not expire, reset on error, or cascade on meeting deletion. Deleting/recreating the same meeting UUID cannot reopen processing. Existing recordings are sealed during migration because historical provider outcomes are unknown. This is deliberately conservative: pending historical recordings also require operator review.

A denied admission returns 409 `MEETING_ALREADY_CLAIMED` before status writes or provider requests. Frontend duplicate handling does not mark the winning meeting failed. The admitted request can issue at most one Whisper request and one summary request. Provider timeouts, invalid output, failures while saving, and crashes retain the claim. No automatic retries or lease expiry: an expired HTTP request may still be charged by the provider. An unavailable/missing claim RPC fails closed without inference.

Tradeoff: a crash between claiming and the first provider request also seals the meeting. A failed/unknown result requires an explicitly reviewed operator recovery after checking provider and stored results. No reset endpoint is provided. New meeting UUIDs/uploads are separate user actions and remain subject to the monthly quota; this is not global audio-content deduplication. Exactly-once admission does not make the two provider calls and database writes one distributed transaction.

## Deployment gate — not executed

The migration and Edge Function must be deployed together after separate approval, migration first. The frontend preview alone does not install this backend protection. Keep existing ownership and explicit-grants migrations in the approval packet. Do not run a blanket db push or rewrite migration history. Existing hosted function versions must not remain reachable for processing after the approved cutover. Rollback must disable processing or retain the claim gate; restoring an older unguarded function reintroduces the risk. Do not clear claims to make a test pass.

Verification: mocked simultaneous endpoint requests, failed/completed replays, missing-RPC failure; isolated SQL tests for historical sealing/ACLs/delete-recreate; real local Supabase with 16 concurrent RPC calls and browser/anonymous denial. No live provider request is needed for any of these tests.
