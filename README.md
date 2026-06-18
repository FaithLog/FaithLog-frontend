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

## 스크립트

- `npm run start`: Expo 개발 서버 실행
- `npm run android`: Android 대상으로 실행
- `npm run ios`: iOS 대상으로 실행
- `npm run web`: Web 대상으로 실행
- `npm run typecheck`: TypeScript 타입 검사

## 개발 기준

작업 전 [agent.md](agent.md)를 먼저 읽고, 구현 전/PR 전에는 [.harness/preflight-checklist.md](.harness/preflight-checklist.md)를 확인합니다.

외부 입력, API query, navigation params, logging/analytics를 다루는 작업은 [.harness/runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md), [.harness/security-and-privacy.md](.harness/security-and-privacy.md), [.harness/injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 함께 확인합니다.
