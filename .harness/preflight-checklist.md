# Preflight Checklist

## 목적

구현 전과 PR 전 반드시 확인할 항목을 한곳에 모아, React Native 크로스플랫폼 앱의 기본 품질을 유지한다.

## 구현 전 체크리스트

- [ ] 기존 파일 구조를 확인했다.
- [ ] 기존 컴포넌트, hook, utility, style, state 패턴을 확인했다.
- [ ] 새 구조를 만들기보다 코드가 생긴 뒤 기존 구조를 우선 따르기로 했다.
- [ ] 기존 공통 컴포넌트로 해결 가능한지 확인했다.
- [ ] 플랫폼 차이 iOS/Android 여부를 확인했다.
- [ ] safe area, 화면 크기, keyboard, orientation 영향을 확인했다.
- [ ] TypeScript 타입 설계와 nullable/optional 의미를 정했다.
- [ ] API 타입과 UI 타입을 분리할 필요를 검토했다.
- [ ] 외부 입력 validation 필요 여부를 확인했다.
- [ ] 사용자 입력이 query/filter/sort/search/API params로 전달되는가?
- [ ] deep link/navigation/storage/push payload가 API query에 영향을 주는가?
- [ ] URL query string을 문자열 연결로 만들 위험이 있는가?
- [ ] sort/filter/search key에 allowlist가 필요한가?
- [ ] GraphQL variables 또는 안전한 SDK method를 사용해야 하는가?
- [ ] backend/API layer의 validation, authorization, parameterized query contract가 필요한가?
- [ ] logging/analytics에 raw user input이 들어갈 가능성이 있는가?
- [ ] 실패 상태 UI를 정의했다.
- [ ] offline/network reconnect 영향을 확인했다.
- [ ] app foreground/background 영향을 확인했다.
- [ ] 새 dependency/config 변경 여부를 확인했다.
- [ ] accessibility label, role, touch target 요구사항을 확인했다.
- [ ] permission, token, local storage, 개인정보 영향 여부를 확인했다.
- [ ] 민감 정보 logging 여부를 확인했다.
- [ ] 다국어/긴 텍스트/date/timezone 영향을 확인했다.
- [ ] 프로젝트에서 채택된 라이브러리 convention을 확인했다.

## PR 전 체크리스트

- [ ] TypeScript 오류가 없다.
- [ ] lint가 통과한다.
- [ ] 관련 test가 통과한다.
- [ ] iOS 영향 범위를 검토했다.
- [ ] Android 영향 범위를 검토했다.
- [ ] 중복 UI 또는 중복 logic을 공통화할지 검토했다.
- [ ] 작은 화면에서 text, button, input이 깨지지 않는다.
- [ ] 큰 화면 또는 tablet에서 layout이 과도하게 늘어나지 않는다.
- [ ] safe area, status bar, navigation bar 영향이 반영됐다.
- [ ] keyboard가 주요 입력과 action을 가리지 않는다.
- [ ] icon button과 interactive element에 accessibility label이 있다.
- [ ] touch target이 충분하다.
- [ ] list, image, animation 성능 위험을 검토했다.
- [ ] 민감 정보가 code, log, analytics, config에 노출되지 않는다.
- [ ] API 응답, params, storage 데이터 validation을 확인했다.
- [ ] URL query string을 안전한 encoder/helper로 생성했다.
- [ ] query/filter/sort/search params를 validation/narrowing했다.
- [ ] allowlist 밖의 값이 안전하게 처리된다.
- [ ] GraphQL user input을 query template에 직접 삽입하지 않았다.
- [ ] deep link/navigation params를 검증 없이 API query로 전달하지 않았다.
- [ ] raw filter/query/search syntax를 직접 조립하지 않았다.
- [ ] backend/API contract에서 parameterized query와 서버 측 validation을 확인했다.
- [ ] logs/analytics에 민감 정보나 raw user input이 노출되지 않는다.
- [ ] invalid params에 대한 테스트 또는 리뷰 근거가 있다.
- [ ] loading, empty, error, offline 상태를 확인했다.
- [ ] iOS/Android lifecycle 영향을 확인했다.
- [ ] union 상태 exhaustive handling을 확인했다.
- [ ] dependency 추가 사유와 대안 검토를 기록했다.
- [ ] 환경별 config가 하드코딩되지 않았다.
- [ ] production log에 민감 정보가 없다.
- [ ] 특정 라이브러리를 새로 전제하지 않았고, 채택된 경우 기존 패턴을 따랐다.

## Definition of Done

- [ ] 사용자가 요청한 기능 또는 문서 목적이 충족됐다.
- [ ] 기존 프로젝트 구조와 패턴을 존중했다.
- [ ] iOS와 Android 차이를 검토했다.
- [ ] 반응형, safe area, keyboard, accessibility를 기본 품질로 확인했다.
- [ ] TypeScript 타입이 불가능한 상태를 줄이도록 설계됐다.
- [ ] 외부 데이터 validation과 실패 상태 처리가 명확하다.
- [ ] query injection / parameter injection 방어가 frontend와 backend/API contract 양쪽에서 검토됐다.
- [ ] lifecycle, offline, reconnect 영향을 검토했다.
- [ ] dependency/config 변경의 build, 보안, 배포 영향을 확인했다.
- [ ] 보안과 개인정보 위험을 확인했다.
- [ ] 필요한 테스트 또는 검증을 수행했고, 수행하지 못한 항목은 이유를 기록했다.
