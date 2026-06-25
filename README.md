# FaithLog Frontend

FaithLog의 React Native frontend 프로젝트입니다. Expo, TypeScript, Docker 기반 개발 환경을 기본으로 둡니다.

## 기준 자료

- Frontend rules: [agent.md](agent.md), [AGENTS.md](AGENTS.md), [.harness/preflight-checklist.md](.harness/preflight-checklist.md)
- API contract: Spring REST Docs HTML at `/Users/josephuk77/FaithLog/build/docs/asciidoc/index.html`
- Screen/API map: [docs/planning/screen-api-map.md](docs/planning/screen-api-map.md)
- Kanban policy snapshot: [docs/planning/frontend-kanban-board.md](docs/planning/frontend-kanban-board.md)
- QA references: [docs/qa/fe-024-mvp-release-check.md](docs/qa/fe-024-mvp-release-check.md), [docs/qa/issue-58-figma-responsive-check.md](docs/qa/issue-58-figma-responsive-check.md)

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

EAS build profile은 `eas.json`의 `EXPO_PUBLIC_API_BASE_URL`을 사용합니다. `preview`와 `production` profile의 `<PREVIEW_API_BASE_URL>`, `<PRODUCTION_API_BASE_URL>`은 EAS/CI에서 실제 배포 API URL로 주입하고, PR 본문이나 문서에는 실제 private endpoint/token 값을 남기지 않습니다.

`EXPO_PUBLIC_MOCK_MODE=true`로 설정하면 API client 내부 mock adapter가 live backend 대신 도메인 fixture를 반환합니다. 화면 코드와 feature service는 live/mock 분기를 직접 알지 않아야 합니다. 기본 MVP QA는 live backend mode(`false`)를 기준으로 하고, mock QA는 fixture adapter 사용 여부와 scenario를 함께 기록합니다.

API base URL이 비어 있거나 `http://` 또는 `https://` URL이 아니면 앱 시작 시 빈 화면 대신 복구 가능한 설정 오류 화면을 보여줍니다. 이 오류 화면은 token, request payload, endpoint 값을 로그나 화면에 노출하지 않습니다.

Firebase native config는 repository에 두지 않습니다. 로컬 native 빌드가 필요할 때만 `google-services.json` 또는 `GoogleService-Info.plist`를 작업 디렉터리에 배치하고, EAS/CI 빌드는 EAS secrets 또는 CI secret injection으로 제공해야 합니다. Firebase 파일, `.env*`, token, private key는 로그, 문서, PR 본문에도 남기지 않습니다.

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
| `preview` | `preview` | `<PREVIEW_API_BASE_URL>` | `false` |
| `production` | `production` | `<PRODUCTION_API_BASE_URL>` | `false` |

Preview/production의 실제 API URL, Firebase native config, service files, token, private key는 repository에 커밋하지 않습니다. EAS/CI secret injection으로 제공하고, PR 본문과 QA 보고에는 placeholder 또는 “주입됨/미확인” 상태만 기록합니다.

## 스크립트

- `npm run start`: Expo 개발 서버 실행
- `npm run android`: Android 대상으로 실행
- `npm run ios`: iOS 대상으로 실행
- `npm run web`: Web 대상으로 실행
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
npx expo export --platform web --output-dir /private/tmp/faithlog-web-export
docker compose build
npm audit --audit-level=moderate
```

기대 결과:

- `npm ci`: 설치 성공. 현재 Expo dependency chain의 `uuid` moderate audit 이슈가 보고될 수 있습니다.
- `npm run typecheck`: `tsc --noEmit` 성공.
- `npm run lint`: ESLint 검사 성공.
- `npm run test`: API client 단위 테스트 성공.
- `npx expo export --platform web`: web bundle export 성공.
- `docker compose build`: frontend image build 성공.
- `npm audit --audit-level=moderate`: 현재 known risk로 10 moderate vulnerabilities가 보고됩니다. `npm audit fix --force`가 Expo breaking downgrade를 제안하면 PR 범위 밖 위험으로 분리 기록합니다.

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

현재 `develop` 기준 GitHub Actions/deploy workflow는 확인되지 않았습니다. 자동 배포, 배포 환경 health check, 배포 후 QA는 workflow 또는 배포 플랫폼 설정이 추가된 뒤 별도 결과로 기록합니다.

## 개발 기준

작업 전 [agent.md](agent.md)를 먼저 읽고, 구현 전/PR 전에는 [.harness/preflight-checklist.md](.harness/preflight-checklist.md)를 확인합니다.

외부 입력, API query, navigation params, logging/analytics를 다루는 작업은 [.harness/runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md), [.harness/security-and-privacy.md](.harness/security-and-privacy.md), [.harness/injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 함께 확인합니다.
