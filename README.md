# FaithLog Frontend

FaithLog의 React Native frontend 프로젝트입니다. Expo, TypeScript, Docker 기반 개발 환경을 기본으로 둡니다.

## 시작하기

```bash
npm install
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

`EXPO_PUBLIC_MOCK_MODE`는 fixture adapter 경계를 명확히 하기 위한 public flag입니다. MVP 앱은 live backend mode(`false`)만 지원하며, `true`로 설정하면 API 호출 대신 fixture adapter가 연결된 별도 빌드가 필요합니다.

API base URL이 비어 있거나 `http://` 또는 `https://` URL이 아니면 앱 시작 시 빈 화면 대신 복구 가능한 설정 오류 화면을 보여줍니다. 이 오류 화면은 token, request payload, endpoint 값을 로그나 화면에 노출하지 않습니다.

Firebase native config는 repository에 두지 않습니다. 로컬 native 빌드가 필요할 때만 `google-services.json` 또는 `GoogleService-Info.plist`를 작업 디렉터리에 배치하고, EAS/CI 빌드는 EAS secrets 또는 CI secret injection으로 제공해야 합니다. Firebase 파일, `.env*`, token, private key는 로그, 문서, PR 본문에도 남기지 않습니다.

## 스크립트

- `npm run start`: Expo 개발 서버 실행
- `npm run android`: Android 대상으로 실행
- `npm run ios`: iOS 대상으로 실행
- `npm run web`: Web 대상으로 실행
- `npm run typecheck`: TypeScript 타입 검사

## 개발 기준

작업 전 [agent.md](agent.md)를 먼저 읽고, 구현 전/PR 전에는 [.harness/preflight-checklist.md](.harness/preflight-checklist.md)를 확인합니다.

외부 입력, API query, navigation params, logging/analytics를 다루는 작업은 [.harness/runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md), [.harness/security-and-privacy.md](.harness/security-and-privacy.md), [.harness/injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 함께 확인합니다.
