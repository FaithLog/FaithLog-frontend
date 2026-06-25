# Post-Deploy QA Checklist

Use this checklist for Issue #94 preview and production deploy verification, and link the completed record from the deploy PR or GitHub issue.

## Deploy Record

| Field | Value |
| --- | --- |
| Environment | preview / production |
| Git commit |  |
| GitHub Actions run |  |
| EAS build ID |  |
| Platform | all / ios / android |
| API base URL status | configured / missing / unknown |
| Firebase native config status | injected / not required / missing / unknown |
| QA owner |  |
| QA date |  |

Do not paste Expo tokens, access tokens, refresh tokens, Firebase file contents, raw passwords, or personal data into this record.

## Automated Checks

| Check | Expected | Result | Notes |
| --- | --- | --- | --- |
| GitHub Actions `EAS Build` run | success |  |  |
| EAS build status | finished / artifact available |  |  |
| Backend reachability | `/api/v1/users/me` returns 401 without auth |  |  |
| TypeScript | `npm run typecheck` passes |  |  |
| Secret leak review | no committed secret values |  |  |

Backend reachability command:

```bash
curl -sS -o /tmp/faithlog-users-me-health.json -w "%{http_code}\n" \
  https://faithlog-549871256004.asia-northeast3.run.app/api/v1/users/me
```

## Manual Smoke

| Area | Result | Notes |
| --- | --- | --- |
| App launches without config error screen |  |  |
| Login screen renders |  |  |
| Login failure state does not expose sensitive data |  |  |
| Authenticated `/api/v1/users/me` path works with a PM-approved test account |  |  |
| Campus list or join entry point renders |  |  |
| Core MVP navigation does not crash |  |  |
| Push/Firebase-dependent path is skipped or verified with injected native config |  |  |
| iOS smoke |  |  |
| Android smoke |  |  |

## Release Note Template

```markdown
Deploy: preview / production
Commit:
EAS build:
GitHub Actions run:
API base URL: configured via PREVIEW_API_BASE_URL / PRODUCTION_API_BASE_URL
Firebase native config: injected / not required / missing
Backend reachability: PASS/FAIL, HTTP status only
Smoke QA: PASS/FAIL/PARTIAL
Rollback target:
Remaining risk:
```
