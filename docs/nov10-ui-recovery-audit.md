# ZENK — November 10 UI recovery audit (2026-11-12)

## Scope and decision
Repository: `nika96830-ui/zenk` only. Do not create a second project, use Expo, rewrite existing Supabase auth/RLS/audio flows, or merge unpublished local work by approximation.

## Sources verified
- Main branch is at `936d73ef3bc8d8684bb818a2ccd033440d823983`; its App.tsx uses React Router and lacks recent security/recording features.
- The most complete *GitHub-backed* working candidate is `fix/zenk-consolidated-security`, PR #18, with 112 commits over main (at the time of audit), including owner-scoped Supabase access, M4A/recording handling, playback, task editing, password reset and AI output checks.
- Vercel READY preview from commit `eb2e22874e49248fd2ef5e258225ab8ce3825a12`: https://zenk-jmm94us4m-zangui.vercel.app (November 3). This is not proof that the November 10 UI was published.
- `fc464fc0fc0f7bce484feb3d50dc98021efc6575` is not an ancestor improvement to current main; compare main to that commit explicitly before any merge.
- The November 10 PromptScript session reported local workspace `/workspace/scratch/55bf3d55767b/zenk`, localized AZ screen work including `src/i18n/azCopy.ts`, Vite chunking, three connected UI screens, Capacitor work and local TS/build success. Source changes were not confirmed pushed.
- The current runtime does not mount that local scratch workspace; the reported local abbreviated commit `3d91cc6` is not retrievable from GitHub.

## Missing from GitHub (checked main and four existing work branches)
- `.promptscript/project.prs`
- `AGENTS.md`
- `src/i18n/azCopy.ts`

The assertion of 22 portable skill directories applies to the prior local workspace, **not** this verified GitHub snapshot. Do not invent placeholder skill folders or symlinks; recover exact directories/resources from the original local workspace first.

## Safe recovery gates
1. Locate the original November 10 local workspace / its exported ZIP and inspect `git status`, `git log`, `git stash list` there. Remote GitHub/Vercel APIs do **not** expose local stashes or uncommitted files.
2. Compare every changed local UI component and configuration file with PR #18's current branch. Copy only verified UI deltas, preserving auth/RLS, private Storage, task ownership, M4A MIME normalization, WebKit checks, process-meeting contracts, and React Router routes.
3. Confirm all 22 original skill folders and accompanying assets exist; validate `@skills` paths without symlinks.
4. Run current CI: `npm ci`, `npx tsc --noEmit`, `npx vite build`, browser Chromium/WebKit suites, Deno type checks, regression suites, isolated SQL and Supabase tests.
5. Only merge or deploy after all gates pass. No production/frontend/backend deployment was performed during this recovery audit.

## Source of truth
- Current verified GitHub implementation: PR #18 (`fix/zenk-consolidated-security`).
- November 10 local design: **unrecovered**, not reproducible without original files.
- Main / production frontend: unchanged by this audit.
