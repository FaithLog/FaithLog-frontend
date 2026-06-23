# Issue 58 Figma and Responsive QA

Issue: <https://github.com/FaithLog/FaithLog-frontend/issues/58>  
Date: 2026-06-23 KST  
Base worktree: clean `develop` worktree, detached HEAD

## PM Acceptance Scope For This Pass

PM acceptance scope for this pass: auth + core regular-user loop (`User 04/05/07/08/09/10`) + Figma Add Needed 5 surfaces + removal of user-facing API/debug copy from those surfaces.

Admin, Service ADMIN, status, and secondary-flow exact pixel parity remains as follow-up inventory, not included in this pass closure.

## Sources Checked

- `agent.md`
- `.harness/preflight-checklist.md`
- `.harness/responsive-mobile-ui.md`
- `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- `docs/planning/screen-api-map.md`
- `docs/planning/frontend-kanban-board.md`
- `docs/api-coverage.md`
- `docs/design/figma-issue-25-final-cleanup.md`
- Figma file `RBpxs4ixQBwFUFHKg9ngh6`

Unavailable in this worktree:

- `AGENTS.md`
- `.harness/definition-of-ready.md`
- `.harness/forms-and-validation.md`
- `.harness/ui-states.md`
- `.harness/screen-and-folder-structure.md`
- `.harness/api-client-and-data-flow.md`

## Auth Fix Result

| Area | Figma node | Result |
| --- | --- | --- |
| Login | `User 01 Login` / `53:496` | Pass. Beige auth visual, title y=92, subtitle y=150, fields/buttons/footnote aligned to Figma coordinates. |
| Signup | `User 02 Signup` / `53:510` | Pass. Title y=30, chip y=74, fields y=150/238/326/414, buttons y=536, title 28px. |
| Current Toss-style login variant | `User 01 Login` / `165:496` | Not required for this fix. PM/user issue targets `53:496` beige login. |

## Responsive And Keyboard Result

| Check | Result |
| --- | --- |
| 320px small phone | Fits without horizontal overflow. Figma 318px fields scale down to the available 272px content width because the screen has 24px horizontal padding. This is a responsive scaled render, not a fixed-width Figma render. |
| 390px Figma baseline | Auth dimensions follow the Figma frame: 318px fields, 50px inputs, 34px buttons, 36px login brand title, 28px signup title, beige palette. |
| Large mobile | Auth frame has `maxWidth: 390`, so content does not stretch excessively. |
| Keyboard | Signed-out/session-expired auth paths use `KeyboardAvoidingView` and `ScrollView` with `keyboardShouldPersistTaps="handled"`. |
| Internal mobile shell | Removed the always-on app marketing header from authenticated screens so current frames can start at the Figma y=30 title area. Shared background now uses the current beige frame tone. |
| Admin / Service ADMIN background | The shared beige/dark palette now applies to regular user, campus admin, and Service ADMIN shells. Code review found no contrast or overflow break from the palette change; exact admin pixel parity remains listed separately in the inventory. |
| Bottom navigation | Shared bottom nav now uses the current Figma 80px white bar and dark active pill treatment instead of the previous blue pill nav. |
| Monthly calendar 320px | Fixed code-level overflow risks: the calendar grid now uses `space-between` instead of fixed 14px column gaps, and quick-check buttons flex instead of keeping fixed 86px widths. |
| Safe area | Auth and internal shells remain inside `SafeAreaView`; internal screens still use shared `Screen`. |

## Core User Loop Recheck

| Screen | Figma node | Current status | This pass |
| --- | --- | --- | --- |
| `User 04 Home` | `53:544` | Pass | Reworked first viewport into Figma-style title/chip, today card, monthly metric tiles, devotion tiles, and recent charge row. Removed user-facing API/debug copy. |
| `User 05 Monthly Calendar` | `53:592` | Pass | Added accessible home sub-state via the `캘린더` CTA and implemented standalone monthly calendar/quick-check screen using documented devotion APIs. |
| `User 07 Poll List` | `53:764` | Pass | Reworked into Figma-style title/chip, filter chips, 82px poll rows, dark action buttons, and answered section. |
| `User 08 Poll Detail` | `53:810` | Pass | Reworked detail and variants into Figma-style title/chip, hero card, option rows, comments/results sections, and dynamic campus chip. |
| `User 09 Payment` | `53:843` | Pass | Reworked into Figma-style title/chip, unpaid hero card, charge filters, 82px charge rows, dark action buttons, and user-facing copy. |
| `User 10 Profile` | `53:889` | Pass | Reworked into Figma-style title/chip, profile identity card, account rows, and logout/campus actions without API/debug copy. |

## 98-Frame Inventory

Status meaning:

- `Pass`: implemented and adjusted in this issue to match the target Figma frame closely.
- `Needs fix`: implementation path exists, and the screen was inspected, but visual parity or runtime screenshot verification still needs more work.
- `Missing`: current app lacks a matching standalone screen/flow.
- `Not required`: archive/candidate/legacy frame, or superseded by the named current frame set.

| Figma frame | Node | Status | Follow-up |
| --- | --- | --- | --- |
| v2 사용자 홈 - 월간 요약 대시보드 | `3:4` | Not required | Legacy/candidate v2 frame; current target is named `User 04 Home`. |
| v2 홈 - 날짜 빠른 체크 모달 | `3:125` | Not required | Legacy/candidate v2 frame. |
| v2 사용자 경건 탭 - 주간 체크와 지각 입력 | `3:218` | Not required | Legacy/candidate v2 frame; current target is `User 05/06` family. |
| v2 사용자 투표 탭 | `3:290` | Not required | Legacy/candidate v2 frame; current target is `User 07/08` family. |
| v2 사용자 납부 탭 | `3:324` | Not required | Legacy/candidate v2 frame; current target is `User 09 Payment`. |
| v2 사용자 내정보 - 관리자 모드 진입 | `3:361` | Not required | Legacy/candidate v2 frame; current target is `User 10 Profile`. |
| v2 관리자 홈 - 운영 요약 | `3:399` | Not required | Legacy/candidate v2 frame; current target is `Admin 01 Home`. |
| v2 관리자 멤버 탭 | `3:437` | Not required | Legacy/candidate v2 frame; current target is `Admin 02 Members`. |
| v2 관리자 경건 - 제출 현황 | `3:477` | Not required | Legacy/candidate v2 frame; current target is `Admin 04/05` family. |
| v2 관리자 투표 - 생성과 미참여자 | `3:521` | Not required | Legacy/candidate v2 frame; current target is `Admin 06-09` family. |
| v2 관리자 정산 - 미납 관리 | `3:555` | Not required | Legacy/candidate v2 frame; current target is `Admin 10-12/22-25` family. |
| Archive 후보 / Toss 일반 01 홈 | `31:6` | Not required | Archive candidate. |
| Archive 후보 / Toss 일반 02 경건생활 | `31:49` | Not required | Archive candidate. |
| Archive 후보 / Toss 일반 03 투표 | `31:115` | Not required | Archive candidate. |
| Archive 후보 / Toss 일반 04 납부 | `31:150` | Not required | Archive candidate. |
| Archive 후보 / Toss 일반 05 내정보 | `31:192` | Not required | Archive candidate. |
| Archive 후보 / Toss 관리자 01 홈 | `31:229` | Not required | Archive candidate. |
| Archive 후보 / Toss 관리자 02 멤버 | `31:272` | Not required | Archive candidate. |
| Archive 후보 / Toss 관리자 03 경건 | `31:316` | Not required | Archive candidate. |
| Archive 후보 / Toss 관리자 04 투표 관리 | `31:357` | Not required | Archive candidate. |
| Archive 후보 / Toss 관리자 05 투표 생성 | `31:390` | Not required | Archive candidate. |
| Archive 후보 / Toss 관리자 06 정산 | `31:429` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 01 로그인 | `49:483` | Not required | Archive candidate. Current target is `User 01 Login` / `53:496`. |
| Archive 후보 / Compact 일반 02 회원가입 | `49:497` | Not required | Archive candidate. Current target is `User 02 Signup` / `53:510`. |
| Archive 후보 / Compact 일반 03 초대코드 | `49:517` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 04 홈 | `49:531` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 05 월간 캘린더 | `49:581` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 06 경건 체크 | `49:679` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 07 투표 목록 | `49:740` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 08 투표 상세 | `49:773` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 09 납부 | `49:804` | Not required | Archive candidate. |
| Archive 후보 / Compact 일반 10 내정보 | `49:840` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 01 홈 | `49:875` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 02 멤버 관리 | `49:910` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 03 멤버 상세 | `49:951` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 04 경건 현황 | `49:985` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 05 투표 관리 | `49:1028` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 06 투표 생성 | `49:1064` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 07 투표 결과 | `49:1105` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 08 정산 관리 | `49:1144` | Not required | Archive candidate. |
| Archive 후보 / Compact 관리자 09 캠퍼스 설정 | `49:1183` | Not required | Archive candidate. |
| User 01 Login | `53:496` | Pass | Fixed in this issue. |
| User 02 Signup | `53:510` | Pass | Fixed in this issue. |
| User 03 Invite Code | `53:530` | Needs fix | Existing no-campus `InviteCodeForm` exists, but authenticated profile `초대코드 추가` is not fully wired to this flow and exact card spacing remains pending. |
| User 04 Home | `53:544` | Pass | First viewport/card copy and metric layout reworked to current Figma tone. |
| User 05 Monthly Calendar | `53:592` | Pass | Added standalone accessible home sub-state with monthly API, weekly API, quick check save, responsive calendar grid. |
| User 07 Poll List | `53:764` | Pass | Poll list reworked to current Figma row/filter/button tone. |
| User 08 Poll Detail | `53:810` | Pass | Poll detail reworked to current Figma hero/option/action tone. |
| User 08 Poll Detail - Custom Multiple | `58:541` | Pass | Multiple-choice option rows and submit action share the reworked detail layout. |
| User 09 Payment | `53:843` | Pass | Payment hero and charge rows reworked to current Figma tone. |
| User 10 Profile | `53:889` | Pass | Profile identity and account rows reworked to current Figma tone. |
| User 08-1 Poll Detail - Wed Fixed + Comments | `58:603` | Pass | Fixed poll/comment flow uses the reworked detail/comments layout. |
| User 08-2 Poll Detail - Coffee Fixed | `58:653` | Pass | Coffee poll flow uses the reworked menu rows and amount copy. |
| User 08-3 Poll Detail - Saturday Fixed | `58:701` | Pass | Saturday fixed poll flow uses the reworked detail option rows. |
| Admin 01 Home | `53:932` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 02 Members | `53:977` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 03 Member Detail | `53:1023` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 04 Devotion Status | `53:1070` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 05 Devotion Missing | `53:1120` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| App 00-1 Session Expired | `611:1068` | Needs fix | Auth gate/session-expired route exists; exact visual pending. |
| App 01 Notification Permission Request | `611:1091` | Needs fix | Implemented in `NotificationPermissionFlow`; exact visual pending. |
| App 01-1 Notification Disabled | `611:1114` | Needs fix | Implemented in `NotificationPermissionFlow`; exact visual pending. |
| App 01-2 FCM Token Register Failed | `611:1137` | Pass | Debug frame name/API copy removed from user-facing card. |
| Admin 06 Poll Manage | `53:1166` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 07 Poll Create | `53:1201` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 07 Poll Create | `62:479` | Needs fix | Duplicate/variant; poll create flow implemented, exact visual pending. |
| Admin 08 Poll Result | `53:1241` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 09 Poll Missing | `53:1289` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 10 Settlement | `53:1334` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin Global Users | `611:1160` | Needs fix | Implemented in `ServiceAdminScreen`; exact visual pending. |
| Admin Global User Detail | `611:1183` | Needs fix | Implemented in `ServiceAdminScreen`; exact visual pending. |
| Admin Global Campuses | `611:1206` | Needs fix | Implemented in `ServiceAdminCampusSection`; exact visual pending. |
| Admin Global Campus Detail | `611:1229` | Needs fix | Implemented in `ServiceAdminCampusSection`; exact visual pending. |
| Admin 13-1 Campus Edit | `611:1252` | Needs fix | Implemented in `ServiceAdminCampusSection`; exact visual pending. |
| Admin 22 Payment Accounts | `611:1275` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 23 Payment Account Create Edit | `611:1298` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 24 Penalty Rules | `611:1321` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 11 Charge Detail | `53:1384` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 12 Notification Confirm | `53:1432` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 13 Campus Settings | `53:1463` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Admin 27 User Role Edit | `536:479` | Needs fix | Implemented in `ServiceAdminScreen`; exact visual pending. |
| Admin 25 Penalty Rule Edit | `611:1344` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| User 13 Prayer Conflict | `611:1367` | Needs fix | Implemented in `PrayerScreen`; exact visual pending. |
| Status 13 Offline Retry | `611:1390` | Needs fix | Shared offline/retry states exist; exact visual pending. |
| Admin 14-1 Notification Log Detail | `611:1413` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Status 01 App Loading | `58:960` | Needs fix | Shared loading state exists; exact visual pending. |
| Status 02 Devotion Submit Loading | `58:969` | Needs fix | Devotion submit loading state exists; exact visual pending. |
| Status 03 Devotion Submit Complete | `58:978` | Needs fix | Devotion completion notice exists; exact visual pending. |
| Status 04 Poll Response Loading | `58:988` | Needs fix | Poll response saving state exists; exact visual pending. |
| Status 05 Poll Response Complete | `58:997` | Needs fix | Poll response completion notice exists; exact visual pending. |
| Status 06 Payment Mark Loading | `58:1007` | Needs fix | Payment mark-paid loading exists; exact visual pending. |
| Status 07 Payment Mark Complete | `58:1016` | Needs fix | Payment mark-paid complete state exists; exact visual pending. |
| Admin 14-2 Notification Target Preview | `611:1436` | Needs fix | Implemented in `AdminScreen`; exact visual pending. |
| Status 08 Notification Sending | `58:1026` | Needs fix | Notification sending state exists; exact visual pending. |
| Status 09 Notification Sent | `58:1037` | Needs fix | Notification sent state exists; exact visual pending. |
| Status 10 Poll Create Loading | `58:1049` | Needs fix | Poll create saving state exists; exact visual pending. |
| Status 11 Poll Create Complete | `58:1060` | Needs fix | Poll create completion notice exists; exact visual pending. |
| Status 12 Save Failed | `58:1072` | Needs fix | Save/action error states exist; exact visual pending. |

## Figma Added

These implemented surfaces did not have a clearly matching current Figma frame in the 98-frame inventory. Added current-tone frames to the Figma file on 2026-06-23 KST:

| Implemented surface | Current handling | Added Figma frame | Parity result |
| --- | --- | --- | --- |
| No-campus onboarding empty state | `NoCampusOnboarding` after login with no ACTIVE campus | `Figma Add Needed / No-campus onboarding empty state` / `631:479` | Added matching current-tone empty state frame; code flow remains mapped to this state. |
| Campus create form | `CampusCreateForm` for MANAGER/ADMIN no-campus flow | `Figma Add Needed / Campus create form` / `631:503` | Added matching form frame with name/location fields and dark CTA; code flow remains mapped to this state. |
| Campus switch sheet | `CampusSwitchSheet` for users with multiple ACTIVE campuses | `Figma Add Needed / Campus switch sheet` / `631:527` | Added matching sheet frame with campus rows; code flow remains mapped to this state. |
| Logout confirm sheet | `LogoutConfirmSheet` | `Figma Add Needed / Logout confirm sheet` / `631:551` | Added matching confirm sheet frame and corrected helper text wrapping in node `631:565`. |
| Notification settings detail | `NotificationSettingsDetail` in profile | `Figma Add Needed / Notification settings detail` / `631:570` | Added matching settings-detail frame with permission and notification connection status rows; code flow remains mapped to this state. |

Screenshot spot checks were completed for `631:479`, `631:527`, `631:551`, and `631:570`; the logout helper text wrap was corrected in node `631:565`.

## State Coverage

- Auth gate keeps `loading`, `signedOut`, `sessionExpired`, `noCampus`, `authenticated`, `permissionDenied`, `conflict`, `offline`, and `error`.
- Regular user cards keep loading/error retry behavior per API card.
- Poll, payment, prayer, campus admin, and Service ADMIN flows preserve route-owned loading, empty, error, retry, permission, conflict, saving/sending states.
- No token, secret, FCM token, refresh token, access token, raw password, or raw payload logging was added.

## Validation

| Command | Result | Notes |
| --- | --- | --- |
| `python3 ~/.codex/skills/pm-harness/scripts/dev_gate.py` | FAIL | Required PM harness metadata files are absent in this worktree. |
| `npm ci` | PASS | Installed dependencies; existing npm audit reports 10 moderate vulnerabilities. |
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `npm run web -- --port 8099` | FAIL | Port conflict; Expo skipped dev server in non-interactive mode. |
| `npm run web -- --port 19099` | FAIL | Offline Expo validation did not open a localhost endpoint within the wait window. |
| `CI=1 EXPO_NO_TELEMETRY=1 npx expo start --web --port 19159 --host localhost` | FAIL | Sandbox run still reported port-null prompt path. |
| `npx expo install react-dom react-native-web` | PASS | Added Expo 56-compatible web dependencies. These are JS/web runtime dependencies; no iOS Pod, Android Gradle, native permission, or config plugin change was required. Existing npm audit still reports 10 moderate vulnerabilities. |
| escalated `CI=1 EXPO_NO_TELEMETRY=1 npx expo start --web --port 19161 --host localhost` | PASS | Metro started and listened on `[::1]:19161`. |
| escalated `curl -I http://[::1]:19161` | PASS | HTTP 200 OK with `Content-Type: text/html`. |
| PM debug/API rg check | PASS for acceptance scope | No hits remain in `src/root`, `src/payments`, `src/polls`, `src/prayers`, or `src/devotion` for FCM/token, snapshot, user/status frame names, or API path patterns. Remaining hits are limited to `src/admin/AdminScreen.tsx` and are tracked as admin follow-up outside this pass scope. |
| Playwright screenshot smoke | BLOCKED | Playwright package is available, but the Chromium browser binary is not installed in `/Users/josephuk77/Library/Caches/ms-playwright`. Browser screenshots were not produced. |

## Remaining Risks

- Login/signup, `User 04`, `User 05`, `User 07`, `User 08` variants, `User 09`, and `User 10` are now marked `Pass` by code/Figma structure review.
- Admin, Service ADMIN, status, and secondary-flow exact pixel parity remains in the inventory as follow-up outside this pass acceptance scope.
- Expo web runtime now starts after adding web dependencies, and HTTP smoke returns 200 OK. Automated browser screenshots remain blocked by missing Playwright browser binaries.
- iOS/Android native simulator screenshots were not produced in this pass.
- Live backend happy/error flows were not exercised.
