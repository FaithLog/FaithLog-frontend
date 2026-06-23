# FaithLog API Coverage

Reference document: `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`

Spring REST Docs HTML is the source of truth for frontend API alignment.
Responses are handled as the common `ApiResponse` envelope with `success`,
`code`, `message`, `data`, and `timestamp`.

## Service ADMIN User APIs

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{userId}`
- `PATCH /api/v1/admin/users/{userId}/role`

Coverage notes:

- Service ADMIN user management is gated to the current user's global
  `role === ADMIN`.
- The role update request accepts only documented global roles:
  `USER`, `MANAGER`, and `ADMIN`.
- The API Docs state that the last active service-wide `ADMIN` cannot be
  demoted to `USER` or `MANAGER`.
- The API Docs do not define a separate endpoint, request field, or error code
  for self-demotion.

## Confirmed Frontend Policy

- At least one global `ADMIN` must always remain.
- A global `ADMIN` must not demote their own account to `USER` or `MANAGER`.
  This is recorded as a client policy/document decision because the API Docs do
  not define a self-demotion-specific contract.
- Demoting the last active global `ADMIN` to `USER` or `MANAGER` is treated as
  a server-side policy conflict and mapped to the existing `409 conflict` UX.
- `403 permissionDenied` remains reserved for users who lack Service ADMIN
  permission.

## No New API Contract

Issue #27 does not add any endpoint, DTO field, query parameter, or error code.
The frontend documentation and Service ADMIN UI only clarify how FE-020 should
present and block the already decided ADMIN demotion policy.

## Admin Poll Management APIs

Related issue: #17 / FE-015.

Implemented in:

- `src/api/adminPollApi.ts`
- `src/admin/AdminScreen.tsx`

Confirmed REST Docs endpoints:

- `GET /api/v1/admin/campuses/{campusId}/poll-templates`
- `POST /api/v1/admin/campuses/{campusId}/poll-templates`
- `GET /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`
- `PATCH /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`
- `DELETE /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`
- `POST /api/v1/admin/campuses/{campusId}/polls`
- `GET /api/v1/campuses/{campusId}/polls`
- `GET /api/v1/campuses/{campusId}/polls/{pollId}/results`
- `GET /api/v1/campuses/{campusId}/polls/{pollId}/comments`
- `GET /api/v1/admin/campuses/{campusId}/polls/{pollId}/missing-members`
- `POST /api/v1/admin/campuses/{campusId}/notifications`

Coverage notes:

- Poll template create/update validates documented fields before calling the
  API: `title`, `pollType`, `selectionType`, `chargeGenerationType`,
  `paymentCategory`, `paymentAccountId`, weekly start/end day/time, and
  options.
- Poll creation supports both `templateId` based creation and direct option
  creation. Direct options use documented `content`, `menuId`, `priceAmount`,
  and `sortOrder` fields.
- Poll results use the REST Docs campus member endpoint
  `GET /api/v1/campuses/{campusId}/polls/{pollId}/results`; no undocumented
  admin-prefixed results endpoint is called.
- Missing members use the documented admin endpoint and notification sending
  uses the documented admin notifications endpoint.
- `401`, `403`, and `409` flow through the existing API client normalization
  into session expired, permission denied, and conflict UI states.

Auto-close policy:

- The frontend does not create or call any manual poll close/status endpoint.
- Poll creation sends `endsAt`; after that time the server is expected to
  transition the poll to `CLOSED`.
- Closed-poll confirm UX is represented by `status === CLOSED`, the displayed
  `endsAt`, and result-only messaging.

## Push Notification Payload Policy

Related issue: #29 / FE-B03.

- The frontend accepts push open navigation payloads only as `{ route, params }`.
- `route` must match a client allowlist entry such as `userHome`, `devotion`,
  `payments`, `polls`, `prayers`, `profile`, `campusAdmin`, or `serviceAdmin`.
- Arbitrary deep link strings, free-form query strings, server-provided paths,
  and server-provided URLs are not executable navigation contracts.
- `params` are route-scoped and must be validated and normalized before
  navigation or API use. Examples: positive integer `pollId`, `campusId`,
  `userId`, or `targetId`; `YYYY-MM-DD` `weekStartDate` or
  `targetWeekStartDate`; allowlisted enum-like strings only when a route
  explicitly supports them.
- Unknown routes, unknown param fields, invalid identifiers, and invalid dates
  are handled as invalid payload state. The frontend must not silently turn them
  into a default deep link or raw API query.
- `401`, `403`, and `409` UX are not changed by FE-B03. Auth/session restore and
  route permission checks still decide whether protected routes can open.
- Loading, empty, error, retry, and offline states remain owned by the target
  screen flow. Push payload validation only decides whether navigation is safe.
- Token, secret, email, and raw payload logging/analytics exposure remains
  disallowed. Invalid payload diagnostics should use non-sensitive reason codes.

API Docs confirmation:

- The REST Docs Notifications section documents `POST /api/v1/users/me/fcm-tokens`,
  `DELETE /api/v1/users/me/fcm-tokens/{tokenId}`,
  `POST /api/v1/admin/campuses/{campusId}/notifications`, and
  `GET /api/v1/admin/campuses/{campusId}/notification-logs`.
- The current API Docs do not define a push notification delivery/open payload
  route schema.
- Therefore `{ route, params }` is recorded as frontend policy. Backend
  coordination is needed before this can be treated as an API/server contract or
  before adding request fields to admin notification send payloads.

## Campus Selection Policy

Related issue: #28 / FE-B02.

- Recent campus selection is a frontend storage policy, not a backend API
  contract change.
- The frontend stores the last selected campusId in secure storage and restores
  it after `GET /api/v1/campuses/me`.
- The stored campusId is used only when it is a positive integer and still
  exists in the current ACTIVE campus list.
- If the stored campusId is missing, invalid, inactive, or no longer joined, the
  first ACTIVE campus from the current response is selected and saved as the new
  recent value.
- No endpoint, DTO field, request body, query parameter, or error code was added
  for FE-B02.
