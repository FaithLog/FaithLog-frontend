# FaithLog Frontend Kanban Board

## Purpose

This planning snapshot records frontend work items that still need product policy
decisions or API/UI coordination.

Reference material checked for issue #27:

- API Docs: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- Original planning references from `/Users/josephuk77/Documents/FeithLog-frontend`
- Current implementation: `src/admin/ServiceAdminScreen.tsx`

Reference material checked for issue #17 / FE-015:

- API Docs: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- Figma: `FaithLog 모바일 와이어프레임 v2`, `디자인 변경` page frames `Admin 06 Poll Manage`, `Admin 07`, `Admin 08`, `Admin 09`
- Current implementation: `src/api/adminPollApi.ts`, `src/admin/AdminScreen.tsx`

Reference material checked for issue #30 / FE-B04:

- API Docs: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- Figma: `FaithLog 모바일 와이어프레임 v2`, node `483:1107`
- Current implementation reference: `src/prayers/PrayerScreen.tsx`

## Ready / Backlog

### FE-015. 관리자 투표 템플릿/생성/결과/미응답자

상태: `Done`

범위:

- 관리자 투표 템플릿 목록/생성/수정/비활성화
- 템플릿 기반 생성과 직접 선택지 생성
- `endsAt` 기반 자동 종료 정책 안내
- 결과/댓글 조회, 미응답자 조회, 미응답 알림 발송
- 401/403/409를 기존 API client error normalization과 관리자 상태 UI로 분리

화면:

- `Admin 06 Poll Manage`
- `Admin 06-1 Poll Templates`
- `Admin 06-2 Poll Template Edit`
- `Admin 06-3 Poll Status Change`
- `Admin 06-4 Poll Close Confirm`
- `Admin 07 Poll Create - Type`
- `Admin 07 Poll Create - Detail`
- `Admin 08 Poll Result + Comments`
- `Admin 09 Poll Missing`

API:

- `GET /api/v1/admin/campuses/{campusId}/poll-templates`
- `POST /api/v1/admin/campuses/{campusId}/poll-templates`
- `PATCH /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`
- `DELETE /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`
- `POST /api/v1/admin/campuses/{campusId}/polls`
- `GET /api/v1/campuses/{campusId}/polls/{pollId}/results`
- `GET /api/v1/campuses/{campusId}/polls/{pollId}/comments`
- `GET /api/v1/admin/campuses/{campusId}/polls/{pollId}/missing-members`
- `POST /api/v1/admin/campuses/{campusId}/notifications`

완료 기준:

- [x] REST Docs 기준 poll template CRUD API client와 request validation
- [x] poll create API client와 `endsAt` 자동 종료 안내
- [x] 결과/댓글/미응답자/알림 수직 슬라이스
- [x] coffee poll account/duty missing 사전 안내
- [x] 수동 close/status API 미구현: CLOSED는 응답 `status`와 `endsAt` 안내로만 처리
- [x] `npm run typecheck` 통과

### FE-020. Service ADMIN 유저 관리

상태: `Backlog`

범위:

- 전역 `ADMIN` 전용 사용자 목록/상세 조회
- 전역 역할 `USER`/`MANAGER`/`ADMIN` 변경
- 403 권한 부족과 409 정책 충돌을 일반 오류와 분리

화면:

- `Admin Global Home`
- `Admin Global Users`
- `Admin Global User Detail`
- `Admin 27 User Role Edit`

API:

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{userId}`
- `PATCH /api/v1/admin/users/{userId}/role`

완료 기준:

- [ ] `user.role === ADMIN` gate
- [ ] name/email/userId/role filter
- [ ] role 변경 위험 confirm
- [x] 마지막 ADMIN 강등 정책 반영: 전역 `ADMIN`은 무조건 1명 이상 남아야 한다.
- [x] 전역 `ADMIN` 자기 자신을 `USER` 또는 `MANAGER`로 강등하는 흐름은 클라이언트 정책으로 허용하지 않는다.
- [x] 마지막 활성 전역 `ADMIN`을 `USER` 또는 `MANAGER`로 강등하는 흐름은 API Docs의 서버 정책에 따라 409 conflict로 거부될 수 있음을 UX/문서에서 분리한다.

정책 메모:

- API Docs는 마지막 활성 서비스 전역 `ADMIN` 1명의 강등 금지를 명시한다.
- API Docs에는 자기 자신 강등 전용 error code 또는 별도 계약이 없으므로, 자기 자신 강등 차단은 새 API 계약이 아니라 클라이언트 정책/문서 결정으로 기록한다.
- 403은 Service ADMIN 권한 없음, 409는 마지막 활성 ADMIN 정책 충돌로 유지한다.

## Resolved Policy Decisions

### FE-B01. 마지막 ADMIN 강등 정책

상태: `Resolved`

결정:

- 어드민은 무조건 한 명은 남아 있어야 한다.
- 전역 `ADMIN` 사용자는 자기 자신을 `USER` 또는 `MANAGER`로 강등할 수 없다.
- 마지막 활성 전역 `ADMIN` 사용자를 `USER` 또는 `MANAGER`로 강등할 수 없다.

영향:

- `FE-020`

구현 기준:

- 자기 자신 강등 금지는 API Docs에 별도 계약이 없으므로 클라이언트 정책으로 문서화한다.
- 마지막 활성 ADMIN 강등 금지는 API Docs의 `PATCH /api/v1/admin/users/{userId}/role` 설명과 맞춰 409 conflict UX로 다룬다.
- 새 endpoint, request field, error code를 임의로 만들지 않는다.

### FE-B02. 여러 캠퍼스 기본 선택 정책

상태: `Resolved`

결정:

- 사용자가 여러 ACTIVE 캠퍼스에 속한 경우 앱 시작 기본 캠퍼스는 최근 선택값을 우선 사용한다.
- 최근 선택값이 없거나 현재 ACTIVE 캠퍼스 목록에 없으면 첫 번째 ACTIVE 캠퍼스로 fallback한다.
- fallback으로 선택된 ACTIVE 캠퍼스는 다음 앱 시작이 같은 기준을 쓰도록 최근 선택값으로 다시 저장한다.

영향:

- `FE-002`
- `FE-007`
- `FE-008`

구현 기준:

- 최근 선택 campusId는 secure storage에 저장한다.
- 저장값은 positive integer로 검증하고, 현재 `GET /api/v1/campuses/me` ACTIVE 목록에 있는 경우에만 사용한다.
- 새 endpoint, request field, query parameter를 임의로 만들지 않는다.

### FE-B03. Push payload route schema

상태: `Resolved`

결정:

- Push notification payload는 `{ route, params }` 형태만 허용한다.
- `route`는 클라이언트 route allowlist에 등록된 화면 키만 허용한다.
- `params`는 route별 허용 필드와 타입으로 검증하고, navigation 또는 API query로 전달하기 전에 정규화한다.
- 임의 deep link 문자열, 자유 query string, 서버가 임의로 주는 path/url 실행은 허용하지 않는다.

영향:

- `FE-006`
- `FE-019`

구현 기준:

- 현재 클라이언트 shell route allowlist 예시는 `userHome`, `devotion`, `payments`, `polls`, `prayers`, `profile`, `campusAdmin`, `serviceAdmin`이다.
- FE-006의 push open 처리는 auth/session 복원 이후 payload shape 검증, route allowlist 확인, route별 params 정규화 순서로 수행한다.
- FE-019의 관리자 알림 발송/로그 문서는 payload navigation 계약이 REST Docs에 명시되기 전까지 새 request field로 단정하지 않는다.
- route별 params 예시는 `polls`의 `pollId: positive integer`, `devotion`의 `weekStartDate: YYYY-MM-DD`, `campusAdmin`의 `campusId: positive integer`, `serviceAdmin`의 `userId: positive integer`처럼 최소 식별자만 허용한다.
- 허용되지 않은 route 또는 invalid params는 임의 fallback navigation 없이 invalid payload 상태로 처리하고, 필요 시 사용자가 기존 홈/목록 화면에서 다시 진입하게 한다.
- 401/403/409 UX, loading/empty/error/retry/offline 상태, token/secret/log 노출 정책은 기존 FE-006/FE-019 기준을 유지하며 이 문서 결정만으로 새 API error code나 보안 예외를 추가하지 않는다.
- API Docs의 Notifications 계약은 FCM token 등록/비활성화, 관리자 알림 발송, 알림 로그 조회만 설명한다. push open payload의 `{ route, params }` 서버 계약은 문서에 없으므로 frontend policy로 기록하고 backend coordination이 필요하다.

### FE-B04. 토요일 다음 주차 기도제목 작성 정책

상태: `Resolved`

결정:

- 토요일에는 사용자 기도제목 작성 화면을 다음 주차로 자동 진입시킨다.
- 다음 주차는 앱 timezone 기준 다음 월요일 `weekStartDate`로 계산한다.
- 토요일 날짜를 prayer API path parameter로 보내지 않는다.

영향:

- `FE-012`

구현 기준:

- FE-012는 기존 REST Docs 계약인 `GET /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}`와 `PUT /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}/submissions`만 사용한다.
- API Docs는 `weekStartDate`가 월요일이어야 한다는 계약, 저장 권한 403, version conflict 409만 설명한다.
- API Docs에는 토요일 다음 주차 오픈 정책을 위한 관리자 설정, endpoint, request field, query parameter, error code가 없다. 이 결정은 frontend policy이며 새 API contract가 아니다.
- 409는 `PRAYER_SUBMISSION_CONFLICT` version conflict 복구로만 유지한다. 최신 서버 데이터 다시 불러오기 또는 내 작성 유지 후 최신 version 확인 UX를 따른다.
- 401/403/409, loading/empty/error/retry/offline 상태는 기존 FE-012 기도제목 조회/저장 흐름을 유지한다.
- token, secret, raw prayer content, raw request payload는 log/analytics에 노출하지 않는다.
- Figma node `483:1107`은 `User 08-6 Poll Results - Responders` 투표 결과 명단 화면으로 확인됐다. 토요일 기도제목 주차 선택 정책과 직접 충돌하는 prayer entry UI 요구사항은 없으므로 UI 변경은 하지 않는다.
