# Repository audit — 2026-11-02

Base: main 936d73ef3bc8d8684bb818a2ccd033440d823983. Main CI passed.

Merged into main: #7, #9, #10, #12. #14 was merged into the #13 branch, not main.
Open: #3 and #5 (failed CI), #8 (passed), #11 (passed), #13 (all four jobs passed), #15 (all four jobs passed, targets #13), #16 (failed CI/build and Vercel), #17 (passed). #18 did not exist at inspection time. #1/#2/#4/#6 closed without merge.

This branch starts at current main and integrates #13/#15, including #14, without changing those PRs or main. Dependency major upgrades and the separate #11 feature branch are not merged. Existing visual styles and branding are preserved.

Additional fixes: reject invalid AI JSON field types, impossible dates and excessive task counts before result persistence; bound stored text and provider request time; reject empty uploads and use UUID recording names; do not mark a meeting failed when a substituted recording path is rejected before processing.

Vercel commit statuses confirm successful existing deployments for main and #15. GitHub deployments listing returns 403 (integration permission); no Vercel connector is available. Preview URLs can be inspected via Vercel bot PR comments. No production deployment, hosted migration/function change, paid inference, data deletion or PR merge is authorized or performed.

Outstanding launch gates: separately approved hosted migration/function deployment, verification of actual OpenAI credentials and balance, approved bounded live AI acceptance, physical iPhone microphone testing, and prevention of concurrent repeated AI processing (quota reservation deduplicates quota, not provider executions). Browser mock tests do not establish live provider or physical-device readiness.
