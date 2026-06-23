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
