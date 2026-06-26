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

- Login success now sends general `USER` accounts directly into the authenticated home shell; it no longer opens `640:649` User 03-2 Campus Select for accounts with an ACTIVE campus.
- General `USER` accounts are treated as single-campus users in the UI: Home/Profile do not expose campus switch/select controls, and campus creation CTAs remain fully hidden rather than disabled.
- `MANAGER` and `ADMIN` are the only roles that can open the campus switch sheet and see the `캠퍼스 생성` CTA.
- The admin campus switch sheet was rechecked against Figma `318:1443` (`관리자 홈 - 캠퍼스 전환 바텀시트`): handle, `캠퍼스 변경` title, campus rows, and “선택 후 해당 캠퍼스의 홈 화면으로 이동” flow are used, with a manager/admin-only `캠퍼스 생성` button added at the bottom.
- Campus selection, invite-code completion, and campus creation completion now return directly to the selected campus home instead of showing the `앱 시작하기` campus detail step.
- `example.test` example emails and 8+ character password validation remain unchanged.

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
- Current follow-up also tried `EXPO_PUBLIC_MOCK_MODE=true CI=1 npx expo start --web --port 8094 --host localhost --non-interactive`; Expo stayed in offline startup and `8094` did not reach LISTEN within 60 seconds, so the session was stopped with Ctrl-C.
