# Screen API Map

## Purpose

This map links Service ADMIN user-management screens to the REST Docs contract
and frontend state policy.

Reference API Docs: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`

## Common API Rules

- Base URL is `/api/v1`.
- Successful and failed responses use the common envelope with `success`,
  `code`, `message`, `data`, and `timestamp`.
- `401`, `403`, and `409` must remain separate UI states.
- The frontend must not invent undocumented endpoints, request fields, or error
  codes.
- Push notification open payloads are treated as external input. The frontend
  accepts only the documented `{ route, params }` policy below, validates route
  and params before navigation, and does not execute arbitrary deep link strings,
  free-form query strings, paths, or URLs supplied by a server.

## Push Payload Route Policy

Related policy: FE-B03.

Payload shape:

```json
{
  "route": "polls",
  "params": {
    "pollId": 123
  }
}
```

Route allowlist examples:

- `userHome`
- `devotion`
- `payments`
- `polls`
- `prayers`
- `profile`
- `campusAdmin`
- `serviceAdmin`

Params validation and normalization:

- Each route owns an explicit params schema. Unknown fields are ignored or
  rejected before navigation; they must not be forwarded into API query params.
- Numeric identifiers such as `pollId`, `campusId`, `userId`, and `targetId`
  must be parsed as positive integers and normalized to numbers.
- Date-like fields such as `weekStartDate` and `targetWeekStartDate` must match
  `YYYY-MM-DD` before use.
- Enum-like fields must be narrowed through an allowlist; unknown strings must
  not become route names, query keys, sort keys, or filter values.
- Missing optional params keep the user on the route's safe list/home state.
  Missing or invalid required params produce an invalid payload state instead of
  silent fallback navigation.
- Auth/session restore runs before protected route navigation. If the restored
  user cannot access `campusAdmin` or `serviceAdmin`, the existing
  permission-denied handling applies.

State and security impact:

- `401`, `403`, and `409` UX remain unchanged. Invalid payload handling is a
  frontend validation state, not a new backend error contract.
- Loading, empty, error, retry, and offline states remain route-owned; this
  policy only controls whether a push open may navigate to that route.
- Payload values, FCM tokens, access tokens, refresh tokens, emails, and raw
  payload bodies must not be logged or sent to analytics.
- The API Docs do not define a push open navigation payload contract. Until the
  backend documents it, `{ route, params }` is a frontend policy and requires
  backend coordination before being treated as a server contract.

## Service ADMIN User Management

| Screen | Feature | API | States | Permission |
| --- | --- | --- | --- | --- |
| `Admin Global Users` | 전역 사용자 목록/검색 | `GET /api/v1/admin/users` | loading, empty, error, permissionDenied | 전역 `ADMIN` |
| `Admin Global User Detail` | 사용자 기본 정보와 캠퍼스 소속 조회 | `GET /api/v1/admin/users/{userId}` | loading, error, permissionDenied | 전역 `ADMIN` |
| `Admin 27 User Role Edit` | `USER`/`MANAGER`/`ADMIN` 전역 역할 변경 | `PATCH /api/v1/admin/users/{userId}/role` | loading, saving, selfDemotionBlocked, conflict409, permissionDenied, error | 전역 `ADMIN` |

## User Devotion

| Screen | Feature | API | States | Permission |
| --- | --- | --- | --- | --- |
| `User 05 Monthly Calendar` | 월간 경건 캘린더와 선택 날짜 빠른 체크 | `GET /api/v1/campuses/{campusId}/devotions/me/monthly-summary?year=&month=`, `GET /api/v1/campuses/{campusId}/devotions/me/weeks/{weekStartDate}`, `PUT /api/v1/campuses/{campusId}/devotions/me/days/{recordDate}` | loading, saving, conflict409, error, retry, offline, permissionDenied | 캠퍼스 ACTIVE 멤버 |

Monthly calendar policy:

- `User 05 Monthly Calendar` is a `userHome` sub-state opened from the home devotion `캘린더` CTA, so the bottom navigation remains on `홈`.
- The screen does not add a new route payload or backend endpoint. It combines the documented monthly summary, weekly summary, and daily check save APIs.
- Month navigation updates the monthly summary query and selects the first day of the target month.
- Quick check save uses the selected date's `recordDate`; the selected week is loaded through Monday `weekStartDate` to preserve the REST Docs weekly path rule.
- `401`, `403`, `409`, loading, empty, error, retry, and offline states remain route-owned and must not log tokens, raw passwords, or raw request payloads.

## User Prayer Board And Entry

| Screen | Feature | API | States | Permission |
| --- | --- | --- | --- | --- |
| `User 11 Prayer Board` | 조별 기도제목 주차 조회 | `GET /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}` | loading, empty, error, retry, offline, permissionDenied | 캠퍼스 ACTIVE 멤버 |
| `User 12 Prayer Entry` | 조별 기도제목 작성/저장 | `PUT /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}/submissions` | loading, saving, conflict409, permissionDenied, error, retry, offline | 같은 기도조 조원/권한 보유 사용자 |

Prayer week entry policy:

- FE-B04 결정에 따라 토요일에는 기도제목 작성 화면을 다음 주차로 자동 진입시킨다.
- 다음 주차는 앱 timezone 기준 토요일 날짜에서 계산한 다음 월요일 `weekStartDate`다. REST Docs의 prayer API는 월요일 `weekStartDate`만 허용하므로 토요일 날짜 자체를 path parameter로 보내지 않는다.
- API Docs에는 토요일 오픈 정책을 위한 관리자 설정, endpoint, field, query parameter, error code가 없다. 이 결정은 frontend policy이며 새 API contract가 아니다.
- FE-012의 조회/저장 DTO와 409 복구는 기존 REST Docs 계약을 따른다. `409 PRAYER_SUBMISSION_CONFLICT`는 version conflict로만 다루고, 최신 서버 데이터 다시 불러오기 또는 내 작성 유지 후 최신 version 확인 UX를 사용한다.
- `401`, `403`, `409`, loading, empty, error, retry, offline 상태는 기존 prayer board/entry 흐름을 유지한다.
- 이 문서 결정만으로 token, secret, raw prayer content, raw request payload logging 예외를 추가하지 않는다.

## Admin Poll Management

| Screen | Feature | API | States | Permission |
| --- | --- | --- | --- | --- |
| `Admin 06 Poll Manage` | 관리자 투표 목록과 템플릿 요약 | `GET /api/v1/campuses/{campusId}/polls`, `GET /api/v1/admin/campuses/{campusId}/poll-templates` | loading, empty, error, permissionDenied | 캠퍼스 관리자 |
| `Admin 06-1 Poll Templates` | 투표 템플릿 목록/생성/수정/비활성화 | `GET/POST/PATCH/DELETE /api/v1/admin/campuses/{campusId}/poll-templates` | loading, saving, empty, conflict409, permissionDenied, error | 캠퍼스 관리자 |
| `Admin 07 Poll Create - Type/Detail` | 템플릿 기반 또는 직접 선택지 투표 생성 | `POST /api/v1/admin/campuses/{campusId}/polls` | loading, validationError, accountMissing, coffeeDutyMissing, conflict409, error | 캠퍼스 관리자 |
| `Admin 08 Poll Result + Comments` | 결과와 댓글 조회 | `GET /api/v1/campuses/{campusId}/polls/{pollId}/results`, `GET /api/v1/campuses/{campusId}/polls/{pollId}/comments` | loading, empty, closed, error, permissionDenied | 캠퍼스 ACTIVE 멤버/관리자 |
| `Admin 09 Poll Missing` | 미응답자 조회와 알림 발송 | `GET /api/v1/admin/campuses/{campusId}/polls/{pollId}/missing-members`, `POST /api/v1/admin/campuses/{campusId}/notifications` | loading, empty, sending, sent, failed, permissionDenied | 캠퍼스 관리자 |

Admin poll close/status policy:

- 수동 poll close/status endpoint는 REST Docs에 없으므로 frontend에서 만들거나 호출하지 않는다.
- 생성 시 `endsAt`을 필수로 보내고, 서버가 `endsAt` 이후 `CLOSED` 상태로 전환한다고 안내한다.
- 닫힌 투표 confirm UX는 `status === CLOSED`와 `endsAt` 안내/결과 확인 문구로 처리한다.
- REST Docs 기준 결과 조회는 admin prefix가 아니라 `GET /api/v1/campuses/{campusId}/polls/{pollId}/results`이다.

## FE-B01 Policy

- 전역 `ADMIN`은 무조건 한 명 이상 남아야 한다.
- 현재 로그인한 전역 `ADMIN`이 자기 자신을 `USER` 또는 `MANAGER`로 강등하는 흐름은 클라이언트 정책으로 차단한다.
- 마지막 활성 전역 `ADMIN`을 `USER` 또는 `MANAGER`로 강등하는 흐름은 API Docs에 명시된 서버 정책과 맞춰 `409 conflict` UX로 처리한다.
- `403 permissionDenied`는 현재 사용자가 Service ADMIN API를 사용할 권한이 없을 때만 사용한다.
- 자기 자신 강등에 대한 별도 서버 error code는 API Docs에 없으므로 새 API 계약으로 간주하지 않는다.

## API Confirmation Needed

- 없음. FE-B01, FE-B02, FE-B04의 정책 결정은 위 기준으로 resolved 처리한다.

## Campus Selection Policy

- 여러 ACTIVE 캠퍼스가 있는 사용자는 앱 시작 시 최근 선택한 campusId를 우선 사용한다.
- 최근 선택값이 없거나 현재 ACTIVE 캠퍼스 목록에 없으면 `GET /api/v1/campuses/me` 응답의 첫 번째 ACTIVE 캠퍼스로 fallback한다.
- fallback 결과는 secure storage에 다시 저장해 다음 시작 때 같은 기준을 사용한다.
- 초대코드 가입, 캠퍼스 생성, 캠퍼스 전환, 프로필/캠퍼스 목록 refresh 후 선택된 캠퍼스도 최근 선택값으로 저장한다.
- 저장된 campusId는 positive integer로 검증하고, API Docs에 없는 query/body/path 계약은 추가하지 않는다.
