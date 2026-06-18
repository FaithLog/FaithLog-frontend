# Agent Guide

이 문서는 에이전트와 개발자가 이 프로젝트에서 작업을 시작할 때 가장 먼저 읽는 진입점이다. 현재 프로젝트에는 코드 구조가 거의 없으므로, 코드가 생긴 뒤에는 기존 구조와 패턴을 먼저 확인하고 그 흐름을 우선 따른다.

## 읽는 순서

1. 이 문서 `agent.md`
2. 구현 전 [preflight-checklist.md](.harness/preflight-checklist.md)
3. 필수 확인 문서: [runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md), [app-lifecycle-and-network.md](.harness/app-lifecycle-and-network.md), [dependency-and-config-rules.md](.harness/dependency-and-config-rules.md), [injection-and-query-safety.md](.harness/injection-and-query-safety.md)
4. 작업 주제에 맞는 세부 하네스 문서
5. 구현 후 [preflight-checklist.md](.harness/preflight-checklist.md)의 PR 전 체크리스트

## 규칙 충돌 시 우선순위

1. 사용자 명시 지시
2. 프로젝트 기존 코드와 패턴
3. `agent.md`
4. `.harness/` 세부 문서
5. 일반적인 업계 관례

상위 규칙과 하위 규칙이 충돌하면 상위 규칙을 따른다. 단, 보안, 개인정보, 데이터 손실 위험이 있으면 작업을 멈추고 사용자에게 확인한다.

## 작업 시작 전 기본 절차

1. 기존 파일 구조를 확인한다.
2. 기존 컴포넌트, style, state, navigation, API 패턴을 확인한다.
3. 작업과 관련된 `.harness/` 문서를 확인한다.
4. 구현 전 [preflight-checklist.md](.harness/preflight-checklist.md)를 확인한다.
5. 새 기능 구현 시 기존 컴포넌트와 패턴 재사용을 먼저 검토한다.
6. 외부 데이터, 네트워크, 앱 lifecycle, dependency 추가, 환경 설정 변경이 있으면 관련 하네스 문서를 반드시 확인한다.
7. API query 추가/수정, search/filter/sort, deep link, navigation params 기반 API 요청, analytics/logging, 외부 데이터 질의 작업에서는 [injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 반드시 확인한다. GraphQL, Supabase, Firebase, search API는 프로젝트에서 채택된 경우에만 해당 규칙을 적용한다.
8. 보안 관련 작업은 [security-and-privacy.md](.harness/security-and-privacy.md)와 [injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 함께 읽는다.
9. 외부 입력 관련 작업은 [runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md)와 [injection-and-query-safety.md](.harness/injection-and-query-safety.md)를 함께 읽는다.
10. 구현 후 PR 전 체크리스트를 확인한다.

## 하네스 문서

- [react-native-cross-platform.md](.harness/react-native-cross-platform.md): iOS/Android 공통 구현, 플랫폼 분기, 네이티브 차이 대응 원칙.
- [component-architecture.md](.harness/component-architecture.md): 컴포넌트 분리, 중복 제거, props와 composition 설계 원칙.
- [responsive-mobile-ui.md](.harness/responsive-mobile-ui.md): 다양한 화면 크기, safe area, 키보드, 터치 영역 대응 원칙.
- [design-system-and-styling.md](.harness/design-system-and-styling.md): 디자인 토큰, 공통 UI 컴포넌트, style 관리 원칙.
- [typescript-rules.md](.harness/typescript-rules.md): TypeScript strict, 타입 모델링, API/UI 타입 분리 원칙.
- [navigation-and-state.md](.harness/navigation-and-state.md): navigation, screen params, 로컬/전역/서버/form 상태 구분 원칙.
- [accessibility.md](.harness/accessibility.md): 모바일 accessibility, screen reader, touch target, font scaling 원칙.
- [performance-rules.md](.harness/performance-rules.md): rendering, list, image, animation, 초기 로딩 성능 원칙.
- [testing-and-quality.md](.harness/testing-and-quality.md): test 범위, 품질 검증, 플랫폼/반응형 확인 원칙.
- [security-and-privacy.md](.harness/security-and-privacy.md): secret, token, local storage, permission, 개인정보 처리 원칙.
- [runtime-data-and-error-handling.md](.harness/runtime-data-and-error-handling.md): 외부 입력 validation, 데이터 경계, 실패 상태 모델링 원칙.
- [app-lifecycle-and-network.md](.harness/app-lifecycle-and-network.md): foreground/background, reconnect, auth 만료, push/deep link 처리 원칙.
- [dependency-and-config-rules.md](.harness/dependency-and-config-rules.md): dependency, native module, environment config, logging/observability 관리 원칙.
- [injection-and-query-safety.md](.harness/injection-and-query-safety.md): query injection, parameter injection, safe query params, backend/API contract 원칙.
- [preflight-checklist.md](.harness/preflight-checklist.md): 구현 전/PR 전 반드시 확인할 체크리스트와 Definition of Done.

## 기본 작업 원칙

- 공통 구현을 기본값으로 두고, 플랫폼 차이가 명확할 때만 분기한다.
- 코드가 생긴 뒤에는 새 폴더 구조를 임의로 만들기보다 기존 구조를 우선 따른다.
- 특정 라이브러리는 프로젝트에서 채택된 경우에만 사용한다. 예: Expo, React Navigation, Zustand, TanStack Query, NativeWind.
- TypeScript 타입은 문서가 아니라 잘못된 상태를 만들기 어렵게 하는 설계 도구로 사용한다.
- 모바일 UI는 작은 화면, 큰 화면, safe area, keyboard, accessibility를 기본 요구사항으로 다룬다.
- 외부 입력은 TypeScript 선언만 믿지 말고 runtime validation, narrowing, fallback을 거친다.
- dependency와 config 변경은 iOS/Android build, app size, 보안, 배포 영향을 함께 검토한다.
- 사용자 입력이 query, filter, sort, search, GraphQL, analytics, logging으로 전달되면 allowlist, safe encoding, backend validation 계약을 확인한다.
