# FaithLog Frontend Kanban Board

## Purpose

This planning snapshot records frontend work items that still need product policy
decisions or API/UI coordination.

Reference material checked for issue #27:

- API Docs: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- Original planning references from `/Users/josephuk77/Documents/FeithLog-frontend`
- Current implementation: `src/admin/ServiceAdminScreen.tsx`

## Ready / Backlog

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
