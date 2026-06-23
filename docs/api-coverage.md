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
