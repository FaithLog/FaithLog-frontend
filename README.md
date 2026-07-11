# FaithLog Frontend

FaithLog의 iOS/Android 전용 React Native frontend 프로젝트입니다. Expo, TypeScript, Docker 기반 개발 환경을 기본으로 두며 Web 빌드는 지원하지 않습니다.

## 기준 자료

- Frontend rules: [agent.md](agent.md), [AGENTS.md](AGENTS.md), [.harness/preflight-checklist.md](.harness/preflight-checklist.md)
- API contract: Spring REST Docs HTML at `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- Screen/API map: [docs/planning/screen-api-map.md](docs/planning/screen-api-map.md)
- Kanban policy snapshot: [docs/planning/frontend-kanban-board.md](docs/planning/frontend-kanban-board.md)
- QA references: [docs/qa/fe-024-mvp-release-check.md](docs/qa/fe-024-mvp-release-check.md), [docs/qa/issue-58-figma-responsive-check.md](docs/qa/issue-58-figma-responsive-check.md), [docs/qa/post-deploy-qa-checklist.md](docs/qa/post-deploy-qa-checklist.md)
- Release deploy workflow: [docs/release/eas-deploy.md](docs/release/eas-deploy.md)

## 시작하기

```bash
npm ci
npm run start
```

Docker로 Metro/Expo 개발 서버를 실행할 수 있습니다.

```bash
docker compose up --build
```

## 환경 설정

API base URL의 source of truth는 `EXPO_PUBLIC_API_BASE_URL`입니다. `app.json`에는 API endpoint를 두지 않습니다.

`.env.example`은 placeholder만 담습니다. 로컬 개발에서는 `.env.local`에 아래 public 값을 설정합니다. 실제 endpoint, token, private key, Firebase config 값은 커밋하지 않습니다.

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
EXPO_PUBLIC_APP_ENV=local
EXPO_PUBLIC_MOCK_MODE=false
```

EAS preview/production은 앱의 런타임 allowlist, `eas.json`, GitHub Actions workflow에 함께 명시된 승인 API origin만 사용합니다. 현재 승인 origin은 MVP Cloud Run URL인 `https://faithlog-549871256004.asia-northeast3.run.app`입니다. Origin을 변경할 때는 세 위치를 같은 PR에서 함께 수정하고 검증해야 합니다. Expo token과 Firebase native config 값은 repository, PR 본문, QA 보고에 남기지 않습니다.

`EXPO_PUBLIC_MOCK_MODE=true`로 설정하면 API client 내부 mock adapter가 live backend 대신 도메인 fixture를 반환합니다. 화면 코드와 feature service는 live/mock 분기를 직접 알지 않아야 합니다. 기본 MVP QA는 live backend mode(`false`)를 기준으로 하고, mock QA는 fixture adapter 사용 여부와 scenario를 함께 기록합니다.

API base URL이 비어 있거나 `http://` 또는 `https://` URL이 아니면 앱 시작 시 빈 화면 대신 복구 가능한 설정 오류 화면을 보여줍니다. 이 오류 화면은 token, request payload, endpoint 값을 로그나 화면에 노출하지 않습니다.

Firebase native config는 repository에 두지 않습니다. 로컬 native 빌드가 필요할 때만 `google-services.json` 또는 `GoogleService-Info.plist`를 작업 디렉터리에 배치하고, EAS 빌드는 EAS secrets `GOOGLE_SERVICES_JSON_BASE64`, `GOOGLE_SERVICE_INFO_PLIST_BASE64`를 `scripts/prepare-firebase-config.js`가 임시 파일로 복원합니다. Firebase 파일, `.env*`, token, private key는 로그, 문서, PR 본문에도 남기지 않습니다.

## API 서버 연결

모든 API 호출은 `/api/v1` 아래의 Spring REST Docs 계약을 기준으로 합니다. 성공/실패 응답은 공통 envelope인 `ApiResponse { success, code, message, data, timestamp }`를 사용합니다.

로컬 live backend QA는 backend dev 서버가 실행 중이고 `.env.local`의 `EXPO_PUBLIC_API_BASE_URL`이 해당 서버의 origin을 가리킬 때만 수행합니다.

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
EXPO_PUBLIC_MOCK_MODE=false
npm run start
```

Mock QA는 `EXPO_PUBLIC_MOCK_MODE=true`로 실행합니다. 기본 fixture는 `src/api/mockFixtures.ts`, live/mock 전환 경계는 `src/api/mockAdapter.ts`와 `src/api/client.ts`에만 둡니다. 실패 상태는 `EXPO_PUBLIC_MOCK_SCENARIO=401|403|409|422|offline|invalid-envelope`로 재현할 수 있습니다. Mock 결과를 live backend 검증 완료처럼 보고하지 말고, 사용한 mode/scenario/fixture 위치를 QA 결과에 함께 기록합니다.

## EAS Preview 준비

`eas.json`의 profile env는 아래 public 값을 사용합니다.

| Profile | `EXPO_PUBLIC_APP_ENV` | `EXPO_PUBLIC_API_BASE_URL` | `EXPO_PUBLIC_MOCK_MODE` |
| --- | --- | --- | --- |
| `development` | `development` | `http://localhost:8080` | `false` |
| `preview` | `preview` | `https://faithlog-549871256004.asia-northeast3.run.app` | `false` |
| `production` | `production` | `https://faithlog-549871256004.asia-northeast3.run.app` | `false` |

Preview/production API origin은 public runtime config이므로 승인값을 코드와 함께 검토합니다. Firebase native config, service files, token, private key는 repository에 커밋하지 않고 EAS/CI secret injection으로 제공하며, PR 본문과 QA 보고에는 placeholder 또는 “주입됨/미확인” 상태만 기록합니다.

## EAS 배포

Preview/production 배포는 GitHub Actions의 `EAS Build` workflow에서 수동 실행합니다. 필요한 설정과 rollback 절차는 [docs/release/eas-deploy.md](docs/release/eas-deploy.md)를 기준으로 합니다.

필수 GitHub 설정:

- `EXPO_TOKEN`: EAS build 실행용 secret

Preview/production API origin은 임의 GitHub variable/secret으로 덮어쓰지 않습니다. 변경은 앱 allowlist와 workflow를 함께 검토하는 코드 변경으로 진행합니다.

필수 EAS secret:

- `GOOGLE_SERVICES_JSON_BASE64`: Android Firebase native config가 필요한 경우
- `GOOGLE_SERVICE_INFO_PLIST_BASE64`: iOS Firebase native config가 필요한 경우

배포 후 PM 상태 확인:

```bash
eas build:list --limit 5
curl -sS -o /tmp/faithlog-users-me-health.json -w "%{http_code}\n" \
  https://faithlog-549871256004.asia-northeast3.run.app/api/v1/users/me
```

`/api/v1/users/me`는 인증 없이 `401`을 반환하는 것이 정상이며, 이 값은 Cloud Run backend와 REST Docs 인증 계약이 살아 있음을 확인하는 smoke signal로 사용합니다.

## 스크립트

- `npm run start`: Expo 개발 서버 실행
- `npm run android`: Android 대상으로 실행
- `npm run ios`: iOS 대상으로 실행
- `npm run typecheck`: TypeScript 타입 검사
- `npm run lint`: ESLint 기반 TypeScript/TSX 정적 검사
- `npm run test`: Vitest 기반 API client 단위 테스트
- `npm run ci`: typecheck, lint, test 순차 실행

## 검증 명령

Clean checkout 또는 PR worktree에서 아래 순서로 기록합니다.

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npx expo config --type public
npx expo export --platform android --output-dir /private/tmp/faithlog-android-export
docker compose build
npm audit --audit-level=moderate
```

기대 결과:

- `npm ci`: 설치 성공. 현재 Expo dependency chain의 `uuid` moderate audit 이슈가 보고될 수 있습니다.
- `npm run typecheck`: `tsc --noEmit` 성공.
- `npm run lint`: ESLint 검사 성공.
- `npm run test`: API client 단위 테스트 성공.
- `npx expo config --type public`: 지원 플랫폼이 iOS/Android로만 해석되고 native 설정이 유효함.
- `npx expo export --platform android`: Android bundle export 성공.
- `docker compose build`: frontend image build 성공.
- `npm audit --audit-level=moderate`: 현재 보고 건수와 전이 의존성 경로를 실행 시점에 기록합니다. `npm audit fix --force`가 Expo breaking downgrade를 제안하면 자동 적용하지 않고 별도 호환성 검토 대상으로 기록합니다.

## QA 절차

수동 QA 결과는 PR 본문 또는 이슈 코멘트에 아래 형식으로 남깁니다.

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| API Docs 대조 | PASS/FAIL/PARTIAL | 확인한 REST Docs section과 endpoint |
| Figma v2 대조 | PASS/FAIL/PARTIAL | 확인한 frame/node 또는 후속 issue |
| local dev | PASS/FAIL/미실행 | `npm run start` 또는 Expo 실행 결과 |
| live backend QA | PASS/FAIL/미실행 | 사용한 test account 범위와 endpoint, 민감값 제외 |
| mock QA | PASS/FAIL/미실행 | `EXPO_PUBLIC_MOCK_MODE`, `EXPO_PUBLIC_MOCK_SCENARIO`, fixture 위치 |
| simulator/device smoke | PASS/FAIL/미실행 | iOS/Android, 화면 크기, safe area, keyboard |
| Docker | PASS/FAIL/미실행 | `docker compose build` 또는 `docker compose up --build` |
| 미실행 항목 | N/A | 이유와 후속 이슈 |

QA 시 token, refresh token, FCM token, raw password, private endpoint, Firebase config, 개인정보를 로그/스크린샷/문서에 남기지 않습니다.

기존 QA 기준 문서는 다음 위치에서 갱신합니다.

- MVP release readiness: [docs/qa/fe-024-mvp-release-check.md](docs/qa/fe-024-mvp-release-check.md)
- Post-deploy QA checklist: [docs/qa/post-deploy-qa-checklist.md](docs/qa/post-deploy-qa-checklist.md)
- Figma/responsive matrix: [docs/qa/issue-58-figma-responsive-check.md](docs/qa/issue-58-figma-responsive-check.md)
- Screen/API mapping updates: [docs/planning/screen-api-map.md](docs/planning/screen-api-map.md)

## MVP 범위와 남은 작업

현재 문서 기준 MVP 구현/검증 범위에는 regular user, campus admin, Service ADMIN, notification, billing, shared danger-confirm 계열이 포함됩니다. Service ADMIN 제거 결정은 현재 `develop` 문서와 open issue 기준으로 확정되어 있지 않습니다. Service ADMIN을 제거하거나 숨기는 변경은 별도 PM/API/Figma 결정과 이슈가 필요합니다.

현재 open issue 기준 주요 남은 작업:

- [#75](https://github.com/FaithLog/FaithLog-frontend/issues/75): 백엔드 dev 서버 기준 핵심 세로 플로우 검증
- [#76](https://github.com/FaithLog/FaithLog-frontend/issues/76): lint/test/CI 스크립트와 최소 API client 테스트 추가
- [#79](https://github.com/FaithLog/FaithLog-frontend/issues/79): API mock adapter와 도메인 fixture 구축
- [#81](https://github.com/FaithLog/FaithLog-frontend/issues/81), [#82](https://github.com/FaithLog/FaithLog-frontend/issues/82): blocked API 계약 확정
- [#64](https://github.com/FaithLog/FaithLog-frontend/issues/64)-[#72](https://github.com/FaithLog/FaithLog-frontend/issues/72): Figma v2 exact pass 후속

GitHub Actions deploy workflow는 수동 `EAS Build` workflow를 기준으로 합니다. 배포 환경 health check, EAS build ID, rollback target, 배포 후 QA 결과는 [docs/qa/post-deploy-qa-checklist.md](docs/qa/post-deploy-qa-checklist.md) 형식으로 PR 또는 이슈 코멘트에 기록합니다.

## 개발 기준

작업 전 [agent.md](agent.md)를 먼저 읽고, 구현 전/PR 전에는 [.harness/preflight-checklist.md](.harness/preflight-checklist.md)를 확인합니다.

외부 입력, API query, navigation params, logging/analytics를 다루는 작업은 [.harness/runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md), [.harness/security-and-privacy.md](.harness/security-and-privacy.md), [.harness/injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 함께 확인합니다.
