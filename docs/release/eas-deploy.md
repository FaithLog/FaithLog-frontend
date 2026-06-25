# EAS Deploy Workflow

Issue: [#94](https://github.com/FaithLog/FaithLog-frontend/issues/94)

FaithLog frontend deploys through EAS Build for preview and production. The backend API target for the current MVP is the Cloud Run service at `https://faithlog-549871256004.asia-northeast3.run.app`.

## Strategy

- `preview`: internal EAS build for PM and QA verification.
- `production`: EAS production build with `autoIncrement` from `eas.json`.
- Backend Docker is not used by this frontend deploy path.
- API base URL defaults to the MVP Cloud Run URL in `eas.json`. GitHub environment variables or secrets can override it at build time, and the workflow writes the selected value into a transient `eas.json` profile inside the GitHub Actions runner.
- Firebase native config files are never committed. EAS project secrets provide base64 content during the remote build, and `scripts/prepare-firebase-config.js` restores temporary native config files on the EAS builder.

## Required GitHub Configuration

Create GitHub environments named `preview` and `production`.

Required repository or environment secret:

- `EXPO_TOKEN`: Expo token with permission to start EAS builds.

Optional environment variable or secret override:

- `PREVIEW_API_BASE_URL`: preview API origin. If omitted, the workflow uses `https://faithlog-549871256004.asia-northeast3.run.app`.
- `PRODUCTION_API_BASE_URL`: production API origin. If omitted, the workflow uses `https://faithlog-549871256004.asia-northeast3.run.app`.

Prefer GitHub environment variables for API origins because `EXPO_PUBLIC_*` values are public client configuration, not private credentials. Use secrets only when PM decides the endpoint should not appear in GitHub workflow logs.

## Required EAS Secrets

Configure these in the Expo/EAS project, not in GitHub source files:

- `GOOGLE_SERVICES_JSON_BASE64`: base64 encoded Android `google-services.json`.
- `GOOGLE_SERVICE_INFO_PLIST_BASE64`: base64 encoded iOS `GoogleService-Info.plist`.

If Firebase native config is not required for a specific build, omit the matching secret. The EAS pre-install script will skip missing values.

Use the EAS dashboard secret UI, or generate the base64 value locally and store only the encoded value in EAS secrets. Do not paste raw Firebase file contents into chat, PRs, docs, or shell history.

```bash
base64 -i /secure/path/google-services.json
base64 -i /secure/path/GoogleService-Info.plist
```

## Deploy Commands

This Issue #94 PR only adds the workflow, config path, and release documentation. It does not prove that a real EAS deploy has already run. The first real deploy remains pending until GitHub has `EXPO_TOKEN` configured and the Expo/EAS project has any required Firebase native config secrets.

Manual GitHub Actions path:

1. Open GitHub Actions.
2. Select `EAS Build`.
3. Run workflow with `profile=preview` or `profile=production`.
4. Use `platform=all` unless PM asks for a platform-specific build.
5. Set `wait_for_build=true` when the workflow should remain open until EAS returns the final build result.

Local fallback, only from a clean branch with EAS secrets already configured:

```bash
EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app \
EXPO_PUBLIC_APP_ENV=preview \
EXPO_PUBLIC_MOCK_MODE=false \
eas build --profile preview --platform all --non-interactive
```

```bash
EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app \
EXPO_PUBLIC_APP_ENV=production \
EXPO_PUBLIC_MOCK_MODE=false \
eas build --profile production --platform all --non-interactive
```

## Verification

Backend reachability check:

```bash
curl -sS -o /tmp/faithlog-users-me-health.json -w "%{http_code}\n" \
  https://faithlog-549871256004.asia-northeast3.run.app/api/v1/users/me
```

Expected unauthenticated result is `401`. `200` or `403` also proves the Cloud Run service is reachable, but `401` is the normal REST Docs contract for `/api/v1/users/me` without an access token.

Build status checks:

```bash
eas build:list --limit 5
eas build:view <build-id>
```

PM can also verify from GitHub:

- GitHub Actions → `EAS Build` → selected run → `Start EAS build` step.
- Expo dashboard → project build list → profile, platform, commit SHA, and artifact status.

## Rollback

Preview rollback:

1. Identify the last known good EAS build from `eas build:list --limit 10`.
2. Share the previous internal install link or rebuild the last known good commit with `profile=preview`.
3. Record the rollback build ID in the issue or PR comment.

Production rollback:

1. Do not merge additional frontend changes while rollback is in progress.
2. Identify the last known good production EAS build and store submission.
3. Re-submit the last known good artifact through the Expo dashboard or rebuild the last known good commit with `profile=production`.
4. Record build ID, platform, submitted artifact, and PM approval in the release note or issue comment.

## Post-Deploy QA

Use [docs/qa/post-deploy-qa-checklist.md](../qa/post-deploy-qa-checklist.md) after every preview or production deploy. Link the completed QA record from the GitHub Actions run, PR, or issue comment.
