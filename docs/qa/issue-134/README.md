# Issue 134 QA

## Scope

- GitHub Issue #134: `[Figma Section 01][Auth] 인증·온보딩·캠퍼스`
- Figma file: FaithLog 모바일 와이어프레임 v2 (`RBpxs4ixQBwFUFHKg9ngh6`)
- Figma section screenshot: `figma-section-01.png`

## Implemented Figma Frames

- `165:496` User 01 Login
- `165:510` User 02 Signup
- `165:530` User 03 Invite Code
- `168:479` User 03-1 Campus Create
- `640:649` User 03-2 Campus Select
- `640:704` User 03-3 Campus Detail
- `303:1433` App 00 Launch - Auth Check
- `303:1443` App 00-1 Session Expired
- `303:1452` App 00-2 No Campus
- `312:1433` App 01 Notification Permission Request
- `312:1477` App 01-1 Notification Disabled
- `526:1098` App 01-2 FCM Token Register Failed

## API Contract Check

- REST Docs checked: `/Users/josephuk77/FaithLog/src/docs/asciidoc/index.adoc`
- Auth endpoints preserved: signup, login, refresh, logout, current user.
- Campus endpoints preserved: create campus, join by invite code, fetch my campuses, fetch campus detail.
- Notification FCM endpoints preserved through existing `registerMyFcmToken` and `deactivateMyFcmToken`.
- No new API endpoint was introduced.

## Validation

- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with pre-existing warnings in `PollScreen.tsx` and existing unused helpers in `FaithLogApp.tsx`.
- `npm run test`: passed, 5 files / 27 tests.
- PM harness scripts:
  - `dev_gate.py`: blocked by missing `harness.yaml`, `AGENTS.md`, and other PM harness metadata files in this repo.
  - `review_gate.py`: blocked by missing `harness.yaml`, quality/TDD policy files, and review/TDD report files in this repo.

## Runtime Screenshot Attempt

- `npm ci` was required because this worktree had no `node_modules`.
- Expo web mock attempt:
  - `8081` was already used by another FaithLog Expo process at `/Users/josephuk77/Documents/FeithLog-frontend`.
  - `8091` also hit Expo's non-interactive port prompt and skipped dev server startup.
- The existing user Expo process was not killed.
- iOS simulator screenshots were not captured in this session because the local dev server could not be started without interrupting an existing Expo process.

## Product Checks

- Example emails use `example.test`.
- Password placeholders and validation remain 8+ characters.
- API endpoints, tokens, raw IDs, and debug strings are not shown in user-facing copy.
- Notification disabled and FCM failure states include retry/settings and continue-later paths.
- Bottom nav, authenticated shell, and Iconex-backed shared UI remain in place.

## PR #144 Follow-up Verification - 2026-06-26

- Login success now always opens `640:649` User 03-2 Campus Select first, even when the account has exactly one ACTIVE campus.
- Selecting a campus from Campus Select opens `640:704` User 03-3 Campus Detail before the user enters the app home.
- No Campus and Campus Select hide all `캠퍼스 만들기` actions when `canCreateCampusWithRole(user.role)` is false. General `USER` accounts only see invite-code entry.
- `MANAGER` and `ADMIN` remain the only roles that can see the campus-create CTA.
- Login, Signup, Invite Code, Campus Create, Campus Select, and Campus Detail CTA rows were moved onto shared lower-frame spacer positioning to match the Figma frame rhythm more closely.
- Notification permission UI is delayed until authenticated onboarding is complete so it cannot push Campus Select or Campus Detail CTAs out of position.

### Follow-up Commands

- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with the same 5 warnings: 2 unused helpers in `PollScreen.tsx`, 3 unused helpers in `FaithLogApp.tsx`.
- `npm run test`: passed, 5 files / 27 tests.

### Follow-up Runtime Attempt

- Installed dependencies with `npm ci` because this worktree initially had no `node_modules`.
- Tried Expo mock web on fresh ports with `EXPO_PUBLIC_MOCK_MODE=true`:
  - `npx expo start --web --port 8092 --host localhost --non-interactive`
  - `CI=1 npx expo start --web --port 8093 --host localhost`
- Both attempts stayed in Expo offline startup without binding `127.0.0.1:8092` or `127.0.0.1:8093`; the sessions were stopped with Ctrl-C.
- iOS simulator/live login flow was not captured because the local Expo dev server did not become reachable, and no backend/Docker process was started.
