# Figma/API/Simulator Coverage Matrix

Issue: <https://github.com/FaithLog/FaithLog-frontend/issues/69>  
Date: 2026-06-25 KST  
Figma file: `RBpxs4ixQBwFUFHKg9ngh6`, page `디자인 변경`  
API Docs: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`

## Inventory Summary

The issue body mentions 128 mobile frames. The current Figma page metadata
returns 113 top-level frames:

| Type | Count | Source |
| --- | ---: | --- |
| Layout section frames | 9 | `Layout Section / ...` wrappers |
| Top-level screen/artifact frames | 104 | direct children of page `163:479` excluding section wrappers |
| Current top-level total | 113 | Figma metadata, 2026-06-25 KST |

This matrix uses the current 104 top-level screen/artifact frames as the
actionable source of truth. The 128-frame number is tracked as a Figma inventory
discrepancy until the design file adds, restores, or identifies the missing
24 frames.

## Status Values

| Status | Meaning |
| --- | --- |
| `Pass` | Code path exists and previous PM QA marked the frame close enough for the current MVP scope. |
| `Partial` | Code/API path exists, but exact Figma parity, simulator evidence, or a variant-specific state is still pending. |
| `Missing` | No clear production code path exists yet. |
| `Not required` | Design artifact, style guide, component board, prototype map, or non-screen reference frame. |

## Coverage Matrix

| # | Figma frame | Node | Code route/component | API Docs section | Status | Remaining work |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | User 01 Login | `165:496` | `FaithLogApp` auth/login form | Auth login | Partial | Code intentionally uses non-personal `example.test`; Figma still shows generic `example@email.com`. |
| 2 | User 02 Signup | `165:510` | `FaithLogApp` signup form, `authForms.ts` | Auth signup | Partial | Code uses safe sample placeholders and 8+ password rule; Figma still contains personal-looking sample text. |
| 3 | User 03 Invite Code | `165:530` | no-campus invite/join flow | Campuses join | Partial | Existing flow needs exact spacing and authenticated profile re-entry QA. |
| 4 | User 03-1 Campus Create | `168:479` | no-campus campus create flow | Campuses create | Partial | Existing flow needs exact Figma and simulator screenshots. |
| 5 | User 03-2 Campus Select | `640:649` | campus switch/selection state | Campuses me | Partial | Existing selection policy documented; exact sheet QA pending. |
| 6 | User 06 Weekly Devotion - 7일 입력 | `554:479` | `DevotionScreen`, weekly edit | Devotion weekly GET/PUT | Partial | 7-day input implemented; exact long-screen/mobile scroll screenshots pending. |
| 7 | User 03-3 Campus Detail | `640:704` | campus detail/profile campus state | Campuses detail | Partial | API client exists; standalone route parity pending. |
| 8 | User 04 Home | `165:544` | `FaithLogApp` home | Users me, Campuses me, Devotion, Charges, Polls | Pass | Recheck on native simulator still pending. |
| 9 | User 04-1 Home - 기도제목 상시 진입 | `234:1388` | home prayer entry CTA | Prayer week | Partial | CTA exists conceptually; exact variant and simulator evidence pending. |
| 10 | User 04-1 Home - 기도제목 진입 제안 | `233:1383` | home prayer suggestion state | Prayer week | Partial | Variant-specific empty/suggestion state needs screenshot QA. |
| 11 | User 05 Monthly Calendar | `165:592` | `FaithLogApp` monthly calendar sub-state | Devotion monthly, weekly, daily save | Pass | Native screenshots pending. |
| 12 | User 10 Profile | `165:907` | profile screen | Users me, Campuses me, FCM tokens | Pass | Native screenshots pending. |
| 13 | User 10-1 Profile - 공동체 메뉴 | `234:1439` | profile campus/community menu | Campuses me | Partial | Variant-specific sheet/menu screenshot pending. |
| 14 | User 06-1 Weekly Devotion - Submitted Locked | `526:991` | `DevotionScreen` submitted state | Devotion weekly | Partial | Read-only submitted state needs simulator screenshot. |
| 15 | User 06-2 Devotion Penalty Result | `526:1046` | `DevotionScreen` penalty result | Devotion weekly, Charges | Partial | Result summary exists conceptually; exact parity pending. |
| 16 | Admin 06 Poll Manage | `165:1186` | `AdminScreen`, `adminPollApi.ts` | Poll templates, polls | Partial | Open issue #70 covers exact pass. |
| 17 | Admin 06-1 Poll Templates | `526:1383` | `AdminScreen`, templates list | Poll templates | Partial | Open issue #70 covers exact pass. |
| 18 | Admin 06-2 Poll Template Edit | `526:1431` | `AdminScreen`, template edit | Poll templates PATCH | Partial | Open issue #70 covers exact pass. |
| 19 | Admin 06-3 Poll Status Change | `526:1476` | status/end-time policy only | Polls | Partial | REST Docs has no manual close endpoint; keep as status display/policy. |
| 20 | Admin 06-4 Poll Close Confirm | `526:1526` | closed-poll confirm policy | Polls | Partial | No manual close API; document as policy-only UX. |
| 21 | Admin 07 Poll Create - Detail | `165:1288` | `AdminScreen`, poll create detail | Admin polls POST | Partial | Open issue #70 covers exact pass. |
| 22 | Admin 07 Poll Create - Type | `165:1240` | `AdminScreen`, poll create type | Admin polls POST | Partial | Open issue #70 covers exact pass. |
| 23 | User 07 Poll List | `352:1517` | `PollScreen` list | Polls list | Pass | Native screenshots pending. |
| 24 | Admin 08 Poll Result + Comments | `165:1337` | `AdminScreen`, poll result/comments | Poll results, comments | Partial | Open issue #70 covers exact pass. |
| 25 | User 08 Poll Detail - Custom Multiple + Comments | `352:1626` | `PollScreen` detail/comments | Poll detail, responses, comments | Pass | Native screenshots pending. |
| 26 | User 08-1 Poll Detail - Wed Fixed + Comments | `554:575` | `PollScreen` fixed poll variant | Poll detail, responses, comments | Pass | Native screenshots pending. |
| 27 | User 08-2 Poll Detail - Coffee Single | `352:1738` | `PollScreen` coffee single variant | Poll detail, coffee menus, responses | Pass | Native screenshots pending. |
| 28 | User 08-3 Poll Detail - Saturday Fixed | `352:1786` | `PollScreen` fixed poll variant | Poll detail, responses | Pass | Native screenshots pending. |
| 29 | User 08-4 Poll Detail - Submitted Editable | `483:991` | `PollScreen` submitted editable state | Poll response PUT | Partial | Variant-specific edit state screenshot pending. |
| 30 | User 08-5 Poll Detail - Submitted Locked | `483:1049` | `PollScreen` submitted locked state | Poll detail | Partial | Variant-specific lock state screenshot pending. |
| 31 | User 08-6 Poll Results - Responders | `483:1107` | `PollScreen` results | Poll results | Partial | Responders layout exact pass pending. |
| 32 | Admin 09 Poll Missing | `165:1387` | `AdminScreen`, missing voters | Poll missing members, notifications | Partial | Open issue #70 covers exact pass. |
| 33 | Admin 28 Poll Template Repeat Create | `483:1172` | `AdminScreen`, template repeat create | Poll templates POST | Partial | Open issue #70 covers exact pass. |
| 34 | Admin 29 Poll Template Repeat Preview | `483:1221` | `AdminScreen`, template preview | Poll templates GET | Partial | Open issue #70 covers exact pass. |
| 35 | User 09 Payment - 즉시 납부 완료 | `352:1580` | `PaymentScreen` | Charges, mark paid | Pass | Native screenshots pending. |
| 36 | User 09-1 Payment Account Missing State | `526:1339` | `PaymentScreen` account missing state | Payment accounts | Partial | Edge state screenshot pending, issue #66. |
| 37 | Admin 10 Settlement | `165:1432` | `AdminScreen`, settlement | Admin charges | Partial | Open issue #68 covers exact pass. |
| 38 | Admin 11 Charge Detail - Direct Paid | `165:1482` | `AdminScreen`, charge detail | Admin member charges | Partial | Open issue #68 covers exact pass. |
| 39 | Admin 11-1 Charge Status Edit | `526:1571` | `AdminScreen`, charge status edit | Admin charge status PATCH | Partial | Open issue #68 covers exact pass. |
| 40 | 관리자 홈 - 캠퍼스 전환 바텀시트 | `318:1443` | campus switch sheet | Campuses me | Partial | Sheet parity and native screenshot pending. |
| 41 | Admin 11-2 Charge Paid Not Allowed | `526:1619` | `AdminScreen`, paid not allowed state | Admin charge status policy | Partial | Edge state screenshot pending. |
| 42 | Admin 12 Billing Account Detail | `583:767` | `AdminScreen`, account detail | Payment accounts | Partial | Open issue #68 covers exact pass. |
| 43 | Admin 22 Payment Accounts | `312:1517` | `AdminScreen`, payment accounts | Payment accounts | Partial | Open issue #68 covers exact pass. |
| 44 | Admin 22-1 Payment Account Deactivate Confirm | `526:1294` | confirm sheet | Payment account deactivate | Partial | Confirm sheet exact pass pending, issue #72 for shared danger sheet. |
| 45 | Admin 23 Payment Account Create Edit | `312:1575` | `AdminScreen`, account create/edit | Payment accounts POST | Partial | Open issue #68 covers exact pass. |
| 46 | Frame 56 | `191:1347` | reference artifact | N/A | Not required | Non-screen reference frame. |
| 47 | Frame 55 | `191:483` | reference artifact | N/A | Not required | Non-screen reference frame. |
| 48 | Admin 01-1 Home - 기도제목 관리 진입 | `234:1490` | admin home prayer entry | Prayer admin | Partial | Open issue #67 covers prayer variants. |
| 49 | User 11 Prayer Board - 조별 기도제목 | `225:1313` | `PrayerScreen` board | Prayer week GET | Partial | Open issue #67 covers exact pass. |
| 50 | User 11-1 Prayer Group Detail - 사랑조 기도제목 | `261:1453` | `PrayerScreen` group detail | Prayer week GET | Partial | Open issue #67 covers exact pass. |
| 51 | User 11-2 Prayer Next Week Entry - 토요일 작성 | `526:1165` | `PrayerScreen`, Saturday next-week policy | Prayer week GET/PUT | Partial | Open issue #67 covers exact pass. |
| 52 | User 12 Prayer Entry - 사람별 저장 | `225:1358` | `PrayerScreen` entry | Prayer submissions PUT | Partial | Open issue #67 covers exact pass. |
| 53 | User 13 Prayer Conflict | `312:1718` | `PrayerScreen` conflict UX | Prayer 409 conflict | Partial | Open issue #67 covers exact pass. |
| 54 | Admin 15 Prayer Season - 조 관리 | `225:1405` | `AdminScreen`, prayer season/group | Admin prayer seasons/groups | Partial | Open issue #67 covers exact pass. |
| 55 | Admin 16 Prayer Members - 배정 | `225:1448` | `AdminScreen`, group members | Admin prayer groups members | Partial | Open issue #67 covers exact pass. |
| 56 | Admin 17 Prayer Dashboard | `234:1540` | `AdminScreen`, prayer dashboard | Prayer/admin dashboard | Partial | Open issue #67 covers exact pass. |
| 57 | Admin 18 Prayer Season Create | `234:1595` | `AdminScreen`, season create | Admin prayer seasons POST | Partial | Open issue #67 covers exact pass. |
| 58 | Common Components / FaithLog v1 | `388:991` | design library reference | N/A | Not required | Component board, not app screen. |
| 59 | Admin 19 Prayer Group Create | `234:1640` | `AdminScreen`, group create | Admin prayer groups POST | Partial | Open issue #67 covers exact pass. |
| 60 | Admin 20 Prayer Weekly Status | `234:1693` | `AdminScreen`, weekly status | Prayer week/admin summary | Partial | Open issue #67 covers exact pass. |
| 61 | Admin 21 Prayer Group Assign | `234:1741` | `AdminScreen`, group assignment | Admin prayer groups members PUT | Partial | Open issue #67 covers exact pass. |
| 62 | Admin 01 Home | `165:950` | `AdminScreen` home | Admin dashboard summary | Partial | Open issue #60 and blocked issue #82 affect final dashboard contract. |
| 63 | Admin 02 Members | `165:999` | `AdminScreen` members | Admin campus members | Partial | Open issue #60 exact admin cleanup pending. |
| 64 | Admin 03 Member Detail + Coffee Duty | `165:1045` | `AdminScreen` member detail/duty | Admin members, duty assignments | Partial | Exact pass pending. |
| 65 | Admin 04 Devotion Status | `165:1092` | `AdminScreen` devotion status | Admin devotion missing/status | Partial | Exact pass pending. |
| 66 | Admin 05 Devotion Missing | `165:1140` | `AdminScreen` missing devotion | Admin devotion missing | Partial | Exact pass pending. |
| 67 | Admin 10 Notification Send | `583:660` | `AdminScreen` notification send | Admin notifications POST | Partial | Open issue #65 exact pass pending. |
| 68 | Admin 11 Notification Logs | `583:700` | `AdminScreen` notification logs | Admin notification logs | Partial | Open issue #65 exact pass pending. |
| 69 | Admin 12 Notification Confirm | `165:1530` | confirm flow | Admin notifications POST | Partial | Open issue #65 and #72 exact pass pending. |
| 70 | Admin 13 Campus Settings + Duty | `165:1561` | `AdminScreen` campus settings/duty | Campuses, duty assignments | Partial | Blocked issue #81 affects campus edit/invite refresh API contract. |
| 71 | Admin 13-1 Campus Edit | `526:1212` | campus edit form | Campus update | Partial | Blocked issue #81. |
| 72 | Admin 13-2 Invite Code Refresh Confirm | `526:1249` | invite refresh confirm | N/A | Missing | Blocked issue #81: REST Docs contract not confirmed. |
| 73 | Admin 14 Notification Logs | `168:1264` | `AdminScreen` notification logs | Admin notification logs | Partial | Duplicate/variant of notification logs. |
| 74 | Admin 14-1 Notification Log Detail | `526:1662` | notification log detail | Admin notification logs | Partial | Open issue #65 exact pass pending. |
| 75 | Admin 14-2 Notification Target Preview | `526:1708` | notification target preview | Admin notifications POST | Partial | Open issue #65 exact pass pending. |
| 76 | Admin 14-3 Notification Send Result | `526:1756` | notification result state | Admin notifications POST | Partial | Open issue #65 exact pass pending. |
| 77 | Admin 24 Penalty Rules | `312:1620` | `AdminScreen`, penalty rules | Penalty rules | Partial | Open issue #68 exact pass pending. |
| 78 | Admin 25 Penalty Rule Edit | `312:1674` | `AdminScreen`, penalty rule edit | Penalty rules PATCH | Partial | Open issue #68 exact pass pending. |
| 79 | Admin 26 Role Management | `457:991` | `ServiceAdminScreen` users | Service ADMIN users | Partial | Open issue #62 exact pass pending. |
| 80 | Admin 27 User Role Edit | `554:632` | `ServiceAdminScreen` role edit | Service ADMIN role PATCH | Partial | Open issue #62 exact pass pending. |
| 81 | App 00 Launch - Auth Check | `303:1433` | auth bootstrap | Auth refresh, users me, campuses me | Partial | Launch state exists; simulator screenshot pending. |
| 82 | App 00-1 Session Expired | `303:1443` | auth gate session expired | Auth refresh | Partial | Exact state screenshot pending. |
| 83 | App 00-2 No Campus | `303:1452` | no-campus onboarding | Campuses me/create/join | Partial | Exact state screenshot pending. |
| 84 | App 01 Notification Permission Request | `312:1433` | notification permission flow | FCM tokens | Partial | Open issue #64 exact push/route handling pending. |
| 85 | Common 01 Danger Confirm Sheet | `583:740` | shared confirm sheet | N/A | Partial | Open issue #72 exact pass pending. |
| 86 | Notification 01 Permission | `583:618` | notification permission settings | FCM tokens | Partial | Open issue #64 exact pass pending. |
| 87 | Status 01 App Loading | `165:1855` | shared app loading | N/A | Partial | Native screenshot pending. |
| 88 | App 01-1 Notification Disabled | `312:1477` | notification disabled state | FCM tokens | Partial | Open issue #64 exact pass pending. |
| 89 | App 01-2 FCM Token Register Failed | `526:1098` | FCM registration failed state | FCM token register | Partial | Open issue #64 exact pass pending. |
| 90 | Status 02 Devotion Submit Loading | `165:1864` | `DevotionScreen` saving | Devotion PUT | Partial | Native screenshot pending. |
| 91 | Status 03 Devotion Submit Complete | `165:1873` | devotion success notice | Devotion PUT | Partial | Native screenshot pending. |
| 92 | Status 04 Poll Response Loading | `165:1883` | `PollScreen` saving | Poll response PUT | Partial | Native screenshot pending. |
| 93 | Status 05 Poll Response Complete | `165:1892` | poll response success notice | Poll response PUT | Partial | Native screenshot pending. |
| 94 | Status 06 Payment Mark Loading | `361:1408` | `PaymentScreen` mark paid saving | Charge mark paid PATCH | Partial | Native screenshot pending. |
| 95 | Status 07 Payment Mark Complete | `165:1911` | payment success notice | Charge mark paid PATCH | Partial | Native screenshot pending. |
| 96 | Status 08 Notification Sending | `165:1921` | notification sending state | Admin notifications POST | Partial | Open issue #65 exact pass pending. |
| 97 | Status 09 Notification Sent | `165:1932` | notification sent state | Admin notifications POST | Partial | Open issue #65 exact pass pending. |
| 98 | Status 10 Poll Create Loading | `165:1944` | poll create saving | Admin polls POST | Partial | Open issue #70 exact pass pending. |
| 99 | Status 11 Poll Create Complete | `165:1955` | poll create success notice | Admin polls POST | Partial | Open issue #70 exact pass pending. |
| 100 | Status 12 Save Failed | `165:1967` | shared save failure state | Common error envelope | Partial | Native screenshot pending. |
| 101 | Style Guide - Tokens & Components | `165:1597` | design system reference | N/A | Not required | Token/component reference, not app route. |
| 102 | Poll UX DB 반영 메모 | `165:1977` | design note | N/A | Not required | Planning note. |
| 103 | 관리자 홈 - 역할 전환 바텀시트 | `165:1983` | role/campus switch sheet | Users me, campus roles | Partial | Exact bottom sheet screenshot pending. |
| 104 | Prototype Navigation Map | `661:503` | prototype map | N/A | Not required | Navigation reference, not app route. |

## Simulator And Responsive Procedure

Use these checks for each exact-pass issue and for final MVP QA:

1. Prepare a clean checkout of `develop`.
2. Install dependencies with `npm ci`.
3. Run `npm run ci`.
4. Start the app with either live backend mode or mock mode:
   - Live: `EXPO_PUBLIC_MOCK_MODE=false` and a reachable `EXPO_PUBLIC_API_BASE_URL`.
   - Mock: `EXPO_PUBLIC_MOCK_MODE=true`, optionally with `EXPO_PUBLIC_MOCK_SCENARIO=401|403|409|422|offline|invalid-envelope`.
5. Capture at least these viewport/device cases:
   - 320px narrow mobile.
   - 390px Figma baseline.
   - Large mobile or small tablet.
   - Keyboard-open forms for auth, campus create/edit, poll create, prayer entry, payment account edit.
   - Safe-area top and bottom overlap, especially bottom nav and sheets.
6. Record screenshots under `docs/qa/` or link the QA artifact path in the PR.

## Current Responsive Evidence

| Area | 320px | 390px | Large mobile | Keyboard | Safe area | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Auth login/signup | Pass by code review | Pass with safe placeholder divergence | Pass | Pass | Pass | `docs/qa/issue-58-figma-responsive-check.md`; current code keeps 8+ password rule. |
| Core user loop (`User 04/05/07/08/09/10`) | Pass by previous PM QA | Pass by previous PM QA | Pass by previous PM QA | Partial | Pass by previous PM QA | Issue #58 QA doc. |
| Prayer variants | Partial | Partial | Partial | Partial | Partial | Open issue #67. |
| Payment/admin billing variants | Partial | Partial | Partial | Partial | Partial | Open issue #68. |
| Notification/status variants | Partial | Partial | Partial | N/A | Partial | Open issues #64/#65. |
| Admin/Service ADMIN screens | Partial | Partial | Partial | Partial | Partial | Open issues #60/#61/#62/#63/#70. |
| iOS simulator screenshots | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | Current PM session has no completed native simulator run for #69. |
| Android simulator screenshots | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | Current PM session has no completed native simulator run for #69. |

## Open Follow-Up By Matrix

- Blocked API contract:
  - #81: campus edit/invite refresh REST Docs contract.
  - #82: campus admin dashboard summary REST Docs contract.
- Exact Figma pass:
  - #60, #61, #62, #63, #64, #65, #66, #67, #68, #70, #71, #72.
- Live backend vertical QA:
  - #75.
- Figma source discrepancy:
  - Issue #69 expected 128 frames, but current `디자인 변경` page exposes 104 top-level screen/artifact frames plus 9 section wrappers.

## Definition Of Done Check

- Figma frame inventory and route/API mapping are documented for all current
  top-level screen/artifact frames.
- Matrix statuses are normalized to `Pass`, `Partial`, `Missing`, and
  `Not required`.
- iOS/Android simulator procedure and current blocker are recorded.
- 320px, 390px, large mobile, keyboard, and safe-area checks have current
  representative evidence or follow-up blockers.
