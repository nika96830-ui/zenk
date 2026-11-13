# ZENK project guidance

This repository is the existing ZENK React + TypeScript + Vite + Capacitor application. Do not migrate to Expo or create a duplicate application.

## Safe integration
- Preserve ownership/RLS restrictions, protected Edge Functions, private audio playback and editable tasks.
- Prefer the current secure branch as the base and selectively port UI and native changes from archived `pr14`.
- Never deploy production, alter production secrets or apply database migrations without explicit approval.
- Perform TypeScript, Vite, regression and browser tests for changed behavior before proposing a merge.

## Mobile design
- Maintain AZ/EN/TR/RU localization, iPhone Safari/WebKit compatibility, and accessible microphone permission failures.
- Use Capacitor for native bridges; do not assume Expo packages are present.

## Source recovery
The November 10 source snapshot is archived as Git bundle `zenk-pr14-3d91cc6.bundle`. Its original SHA is `3d91cc6362288470cb338bdfe49e7b70c9e0c727`. The bundle is not committed to this repository.