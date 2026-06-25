# 2026-06-25 Cloud Run Core Flow QA

## Summary

- Issue: #75, `test(qa): 백엔드 dev 서버 기준 핵심 세로 플로우 검증`
- Frontend branch: `codex/issue-75-cloudrun-qa-report`
- Backend target: `https://faithlog-549871256004.asia-northeast3.run.app`
- Backend mode: Cloud Run dev/QA URL only. Docker backend was not used or started.
- Frontend env: `EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app`
- Test account policy: only synthetic `example.test` account was used.
- Test password policy: password length was 8+ characters. Raw password is not recorded.
- Sensitive data policy: access token, refresh token, raw password, and exact email local-part are not recorded.
- API contract reference: `/Users/josephuk77/FaithLog/src/docs/asciidoc/index.adoc`

## Execution Environment

| Item | Result |
| --- | --- |
| Date | 2026-06-25 |
| Backend | Cloud Run dev URL |
| Frontend install | `npm ci` PASS. Reported existing `uuid` deprecation warning and 10 moderate audit findings. |
| Typecheck | `npm run typecheck` PASS |
| Web export | `EXPO_PUBLIC_API_BASE_URL=... EXPO_NO_TELEMETRY=1 npx expo export --platform web --output-dir /private/tmp/faithlog-web-export-issue75` PASS |
| Local UI server | BLOCKED. Expo dev/static server path did not reach a stable listening state in this environment. |
| Browser/Playwright UI QA | BLOCKED by local server/port environment. No product code was changed to work around it. |

## UI Execution Attempt

- `npx expo start --web --host localhost --port 19006` started dependency validation in offline mode, then did not bind a reachable local port before timeout.
- Static export succeeded, but `python3 -m http.server 19006 -d /private/tmp/faithlog-web-export-issue75` did not become reachable from `curl http://localhost:19006` before timeout. The interrupted Python stack was still importing standard networking modules.
- `gstack browse goto http://localhost:19006` could not start its helper server because no port was available in its configured range.
- PM instruction was to stop spending time on local UI server/Playwright and record API probe evidence instead.

## Cloud Run API Probe Results

All request/response details below are shape summaries. Token fields, refresh tokens, raw password, and exact email local-part are intentionally omitted or masked.

| Flow | Status | Endpoint | Request shape | Response status/body shape | UI symptom | REST Docs mismatch |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Signup | PASS | `POST /api/v1/auth/signup` | `{name, email, password}` | `201`, envelope `{success, code, message, data:{id,name,email,role,isActive}, timestamp}` | UI not verified due local server block. API returned signup success. | None observed |
| 1. Login | PASS | `POST /api/v1/auth/login` | `{email, password}` | `200`, envelope `{data:{user, accessToken, refreshToken, refreshTokenExpiresIn}}` shape. Tokens redacted. | UI not verified. API returned login success. | None observed |
| 2. Refresh token app re-entry | PASS | `POST /api/v1/auth/refresh` | `{refreshToken}` redacted | `200`, envelope `{data:{accessToken, refreshToken, refreshTokenExpiresIn}}` shape. Tokens redacted. Follow-up `GET /users/me` with new access token returned `200`. | UI re-entry not verified. API refresh path works. | None observed |
| 3. Get current user | PASS | `GET /api/v1/users/me` | bearer access token | `200`, envelope `{data:{id,name,email,role,isActive,lastLoginAt,campusMemberships:[]}}` | UI not verified. API returned current user with empty memberships. | None observed |
| 4. Get my campuses | PASS, empty | `GET /api/v1/campuses/me` | bearer access token | `200`, envelope `{data:[]}` | Expected no-campus empty state should be shown, but UI not verified. | None observed |
| 5. Join campus by invite code | BLOCKED for success, PASS for invalid invite | `POST /api/v1/campuses/join` | `{inviteCode}` using `NO-SUCH-CODE` only | `404`, envelope `{code:CAMPUS_INVALID_INVITE_CODE, data:null}` | UI invalid-invite message not verified. Success path blocked because no QA seed invite code was available. | None observed |
| 5. Create/select campus | BLOCKED for success, PASS for permission error | `POST /api/v1/campuses` | `{name, region, description}` | `403`, envelope `{code:CAMPUS_CREATE_FORBIDDEN, data:null}` for synthetic USER account | UI permission-denied state not verified. Success path requires MANAGER/ADMIN. | None observed |
| 6. Get weekly devotion | BLOCKED for success, PASS for 403 | `GET /api/v1/campuses/1/devotions/me/weeks/2026-06-22` | bearer access token | `403`, envelope `{code:DEVOTION_ACCESS_FORBIDDEN, data:null}` | UI permission-denied state not verified. Success path blocked by no active campus membership. | None observed |
| 7. Save daily devotion check | BLOCKED for success, PASS for 403 | `PUT /api/v1/campuses/1/devotions/me/days/2026-06-25` | `{quietTime,bibleReading,prayer,saturdayWorship,saturdayWorshipLateMinutes}` | `403`, envelope `{code:DEVOTION_ACCESS_FORBIDDEN, data:null}` | UI save/toast not verified. Success path blocked by no active campus membership. | None observed |
| 8. Save/submit weekly devotion | BLOCKED | `PUT /api/v1/campuses/{campusId}/devotions/me/weeks/{weekStartDate}` | REST Docs reviewed only | Not called because no active campus membership/campus seed was available. | UI draft/submit states not verified. | Not verified |
| 9. List payment accounts | BLOCKED for success, PASS for 403 | `GET /api/v1/campuses/1/payment-accounts` | bearer access token | `403`, envelope `{code:BILLING_PAYMENT_ACCOUNT_LIST_FORBIDDEN, data:null}` | UI account empty/success not verified. Success path blocked by no active campus membership. | None observed |
| 10. My charges list/summary | BLOCKED for success, PASS for 403 | `GET /api/v1/campuses/1/charges/me?page=0&size=20&sort=createdAt,desc`; `GET /api/v1/campuses/1/charges/me/summary?year=2026&month=6` | bearer access token; safe query params | Both returned `403`, envelope `{code:BILLING_CHARGE_LIST_FORBIDDEN, data:null}` | UI charge list/summary states not verified. Success path blocked by no active campus membership. | None observed |
| 11. Mark my charge paid | BLOCKED for success, PASS for 403 | `PATCH /api/v1/campuses/1/charges/me/1/paid` | `{}` | `403`, envelope `{code:BILLING_MY_CHARGE_PAYMENT_FORBIDDEN, data:null}` | UI success notice not verified. Success path blocked by no owned unpaid charge item. | None observed |
| 12. Admin campus members | BLOCKED for success, PASS for 403 | `GET /api/v1/admin/campuses/1/members` | bearer access token | `403`, envelope `{code:CAMPUS_MEMBER_MANAGE_FORBIDDEN, data:null}` | UI admin members permission-denied state not verified. Success path requires campus admin/service admin. | None observed |
| 13. Admin settlement summary | BLOCKED for success, PASS for 403 | `GET /api/v1/admin/campuses/1/charges?page=0&size=20&sort=createdAt,desc` | bearer access token; safe query params | `403`, envelope `{code:BILLING_CHARGE_LIST_FORBIDDEN, data:null}` | UI settlement dashboard not verified. Success path requires campus admin/service admin. | None observed |

## Required State Coverage

| State | Result | Evidence |
| --- | --- | --- |
| Loading | BLOCKED | Local UI execution did not reach a stable browser session. |
| Empty | PASS at API layer | `GET /api/v1/campuses/me` returned `200` with `data:[]` for the synthetic account. |
| 401 session expired/unauthorized | PASS at API layer | `GET /api/v1/users/me` without token returned `401 AUTH_UNAUTHORIZED`. Using refresh token as bearer also returned `401 AUTH_UNAUTHORIZED`. |
| 403 permission denied | PASS at API layer | Campus create, admin members, admin charges, devotion, payment account, and charge endpoints returned expected `403` envelopes for a plain USER without membership. |
| 409 conflict | NOT VERIFIED | No safe Cloud Run scenario with existing campus membership/duplicate membership or duplicate state was available without seed data. |
| Offline/network error | BLOCKED | Local UI/browser execution was blocked. No product code changes were made to simulate network failure. |
| Success toast/notice | BLOCKED | Signup/login/refresh succeeded at API layer, but UI notice/toast behavior was not verified due local server block. |
| Invalid invite | PASS at API layer | `POST /api/v1/campuses/join` with `NO-SUCH-CODE` returned `404 CAMPUS_INVALID_INVITE_CODE`. |

## REST Docs Cross-Check

- Auth, Users, Campuses, Devotion, Billing, and Admin Campuses sections were checked against `/Users/josephuk77/FaithLog/src/docs/asciidoc/index.adoc`.
- Observed Cloud Run response envelope matched the documented common envelope shape: `{success, code, message, data, timestamp}`.
- No response-shape mismatch was observed in the executed API probes.
- Success flows after campus membership were not fully contract-verified against live Cloud Run because no seed invite code, campus admin account, service admin account, or pre-created charge data was available in the provided scope.

## Follow-Up Issue Candidates

1. Provide Cloud Run QA seed data for #75: at least one invite code, one active member account, one campus admin/service admin account, one payment account, one unpaid charge item, and one devotion week fixture.
2. Add a documented safe QA reset/seed endpoint or fixture script for dev Cloud Run so vertical flows can be repeated without touching production-like data.
3. Add a frontend smoke-test path that can run against exported web assets in restricted environments where dev server port binding is unreliable.
4. Add explicit UI tests or mock-mode scenarios for `401`, `403`, `409`, offline, invalid invite, no-campus empty, and success notice states, while keeping live backend QA clearly separate.
5. Investigate local Codex environment port allocation: Expo dev server, Python static server, and `gstack browse` all failed to provide a reachable local UI target during this session.

## Final Status

DONE_WITH_BLOCKED_SUCCESS_PATHS.

Cloud Run API probe validated auth, refresh, current user, empty campus list, 401, 403, and invalid invite behavior. Full campus/devotion/billing/admin success paths remain blocked by missing Cloud Run QA seed data and lack of administrator/member credentials in the issue scope. UI/browser state verification remains blocked by local server/port environment failure, not by a product-code change.
