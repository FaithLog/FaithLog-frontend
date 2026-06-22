# FE-024 MVP QA and release check

Issue: <https://github.com/FaithLog/FaithLog-frontend/issues/26>
Branch: `feat/26-mvp-qa-release-check`
Base: `origin/develop` (`d76eb63`)
Date: 2026-06-23 KST

## Summary

This pass records the MVP release readiness state for the Expo React Native frontend. The automated local checks passed, while device-level iOS/Android smoke and live backend integration were not completed in this session.

## Source material checked

- Project rules: `AGENTS.md`, `agent.md`, and available `.harness/` documents.
- API contract: Spring REST Docs HTML at `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`.
- Figma: file `RBpxs4ixQBwFUFHKg9ngh6`.
- Figma release baseline page: `디자인 변경` (`163:479`).
- Linked issue node: `483:1107`, resolved as `User 08-6 Poll Results - Responders`.
- Planning references from the original repo, read-only where absent from the clean worktree: `docs/planning/screen-api-map.md`, `docs/planning/frontend-kanban-board.md`, and `docs/api-coverage.md`.

## Automated verification

| Check | Result | Notes |
| --- | --- | --- |
| `npm ci` | PASS | Completed with existing npm audit report: 10 moderate vulnerabilities. |
| `npm run typecheck` | PASS | TypeScript check completed with `tsc --noEmit`. |
| `docker compose build` | PASS | Docker image build completed. |
| lint script | N/A | `package.json` has no lint script. |
| test script | N/A | `package.json` has no test script. |
| Expo/iOS/Android smoke | PARTIAL | Expo scripts exist, but simulator/device smoke was not run in this session. |

## Harness result

- Initial `dev_gate.py` invocation failed because `python` was not available in the shell environment.
- Re-running with `python3` reached the harness, but the clean issue worktree did not contain the PM harness metadata files required by the gate.
- This is recorded as an environment/harness gap, not as an application runtime failure.

## API and client contract spot check

- REST Docs contain endpoint groups for regular user, campus admin, and Service ADMIN flows.
- The frontend keeps API access centralized in `src/api/client.ts`, response/error typing in `src/api/types.ts`, common error policy in `src/api/errorPolicy.ts`, and token persistence in `src/api/tokenStorage.ts`.
- Token storage uses `expo-secure-store`; no token/secret logging pattern was found in the checked source paths.
- MVP code paths reviewed at a contract level:
  - Auth/session/campus gate: `src/auth/*`, `src/campus/campusForms.ts`, `src/root/FaithLogApp.tsx`.
  - Regular user loop: devotion, poll, payment, and prayer screens.
  - Campus admin loop: `src/admin/AdminScreen.tsx`.
  - Service ADMIN gate and management: `src/admin/ServiceAdminScreen.tsx`, `src/admin/ServiceAdminCampusSection.tsx`.

## UX state and error handling check

- Loading, empty, error, retry, permission, and conflict states are implemented through existing screen state handling and shared UI components.
- 401, 403, and 409 are separated by the common error policy added earlier:
  - 401: authentication/session recovery path.
  - 403: permission-denied UX.
  - 409: conflict UX and retry/recovery messaging.
- This pass verified the code paths and policy mapping. It did not exercise live backend responses.

## Figma comparison

- The release baseline page `디자인 변경` (`163:479`) contains the expected regular user, admin, Service ADMIN, notification, billing, and shared danger-confirm screen groups from the final Figma cleanup.
- The linked Figma node `483:1107` is `User 08-6 Poll Results - Responders`, which is part of the poll results/responders flow.
- No Figma write was performed in this issue.

## Completion checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| `npm run typecheck` passes | Fulfilled | Automated check PASS. |
| Docker or Expo result recorded | Fulfilled | Docker build PASS; Expo/device smoke not run. |
| Login to regular user core loop checked | Partially fulfilled | Code/API/Figma contract review completed; live app flow not exercised. |
| Admin core loop checked | Partially fulfilled | Code/API/Figma contract review completed; live app flow not exercised. |
| Service ADMIN gate checked | Partially fulfilled | Code/API/Figma contract review completed; live app flow not exercised. |
| Loading/empty/error/retry state checked | Partially fulfilled | Code path and common UI review completed; live runtime not exercised. |
| 401/403/409 UX impact checked | Partially fulfilled | Error policy and screen usage reviewed; live backend errors not exercised. |
| Sensitive token/secret exposure checked | Fulfilled | Secure storage path reviewed; no checked source path logs tokens/secrets. |

## Remaining risks

- iOS/Android simulator or physical-device smoke was not run in this session.
- Live backend happy/error path testing was not run, so REST Docs/API matching is based on static contract and client review.
- `npm ci` reports 10 moderate vulnerabilities; this is existing dependency risk.
- Some planning docs referenced by the kanban issue are absent from the clean `origin/develop` worktree and were read from the original repo path as read-only references.
- `docs/api-coverage.md` contains stale references to older workbench-style file names in the original planning material.

## DoR status

- Automated project checks available in the repo passed.
- Docker build result is recorded.
- API Docs/Figma/code mapping was reviewed at static-contract level.
- Remaining gaps are documented explicitly for PM review rather than hidden as complete live QA.
