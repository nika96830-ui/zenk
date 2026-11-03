# AI failure handling in PR #18

Prepared code changes only. The historical live 500 has no recoverable caught-error detail; these changes do not prove its original cause or successful live processing. No new paid request or hosted deployment is part of this validation.

## Confirmed code problems addressed

- Provider failures were collapsed into HTTP 500 except two codes. Classification now uses the response status and safe error code/type, including quota errors with only `error.type`. Keys, provider bodies and network exception text never leave the server.
- The transcription used to remain only in memory until analysis succeeded. It is now checkpointed through caller RLS immediately after Whisper succeeds and before another paid request. If that owner-visible row cannot be saved, analysis is not requested.
- The meeting used to become completed before task insertion. Completion is now the final owner-scoped update, after analysis/tasks have been saved and tasks read back. Failure leaves a failed record with whatever valid transcript/analysis was saved, without replaying inference.

## Public error contract

Existing `error` JSON field remains. `invalid_api_key` and `insufficient_quota` remain compatible with existing client messages. Other safe codes are:

| Condition | HTTP | Error |
| --- | --- | --- |
| Provider key/quota/access/model configuration | 503 | `invalid_api_key`, `insufficient_quota`, `OPENAI_ACCESS_DENIED`, `OPENAI_MODEL_UNAVAILABLE` |
| Provider rate limiting | 429 | `OPENAI_RATE_LIMITED` |
| Provider/network outage | 502 | `OPENAI_UNAVAILABLE` |
| Invalid provider JSON/schema | 502 | `INVALID_AI_RESPONSE` |
| Provider timeout | 504 | `OPENAI_TIMEOUT` |

Unknown internal database failures still return generic HTTP 500; operator logs identify the stage without user text or secrets. Frontend maps access/model failures to the existing localized configuration message and rate limiting to the existing localized rate-limit message. The visual design is unchanged.

JWT verification, getUser, owner/path checks, caller RLS, service-only quota and durable admission are unchanged. There are no automatic retries, fallbacks to another model, admission expiry, or claim/quota resets. A failed request may already be charged; do not replay it or recreate a meeting to bypass that constraint without a new explicitly approved test.

## Verification and release limits

Mocked provider failures cover authentication, quota type/code, permissions, missing models, rate limiting, non-JSON bodies and timeouts. Persistence tests cover transcription checkpoint failures, failed analysis, failed task insertion, final completion failures, and completion ordering; every write remains owner-filtered. Duplicate requests still return 409 without provider calls or duplicate tasks. Browser tests exercise real supabase-js FunctionsHttpError parsing over mocked HTTP.

Run Deno checks, frontend TypeScript/build and the existing CI workflow. A successful mock/CI result is not live AI acceptance. Production deployment and any additional paid test require separate authorization; existing historical admissions and evidence must remain intact.
