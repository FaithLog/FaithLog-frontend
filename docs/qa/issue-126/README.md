# Issue 126 Devotion Flow QA

Date: 2026-06-26 KST

Figma checked:

- `User 05 Monthly Calendar` / node `165:592`
- `User 06 Weekly Devotion - 7일 입력` / node `554:479`
- `User 06-1 Weekly Devotion - Submitted Locked` / node `526:991`

Simulator evidence:

- `monthly-calendar-overview.jpg`: monthly calendar overview, selected-day quick check, weekly submit entry.
- `weekly-devotion-entry.jpg`: weekly devotion 7-day entry and progress.
- `weekly-devotion-submit.jpg`: weekly late-minutes/progress summary and draft/submit actions.

Run mode:

- iOS Simulator `iPhone 17`, Expo mock mode: `EXPO_PUBLIC_MOCK_MODE=true`.
- Live Cloud Run success path was not revalidated in this pass; prior Cloud Run QA remains blocked for devotion success paths without active campus/member seed data.
