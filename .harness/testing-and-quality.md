# Testing And Quality

## 목적

테스트와 품질 확인을 통해 기능 회귀, 플랫폼 차이, 반응형 깨짐, 접근성 누락을 줄인다.

## 해야 할 것

- 핵심 business logic은 unit test를 우선 작성한다.
- common component는 interaction 중심 테스트를 권장한다.
- 버그 수정 시 재발 방지 테스트를 추가한다.
- platform-specific code는 iOS와 Android 영향 범위를 기록한다.
- responsive UI, safe area, keyboard, accessibility를 PR 전 확인한다.
- loading, empty, error, offline, permission denied 같은 failure state를 테스트한다.
- timeout, invalid API response, expired token, lifecycle resume, deep link 시나리오를 검증한다.
- query/filter/sort/search params validation을 테스트한다.
- deep link/navigation params가 잘못된 경우 safe default, fallback, error state로 처리되는지 테스트한다.
- URL encoding과 allowlist 밖의 sort/filter 값 처리를 확인한다.
- GraphQL을 프로젝트에서 채택한 경우 variables 사용 여부와 query string 직접 삽입 방지를 리뷰하거나 테스트한다.
- raw user input이 logging/analytics에 그대로 들어가지 않는지 확인한다.
- 긴 텍스트, 날짜/시간/숫자 형식, timezone 영향이 있는 UI를 확인한다.
- 프로젝트에 test framework가 채택된 경우 기존 test style을 따른다.

## 피해야 할 것

- snapshot test만으로 UI 품질을 보장한다고 보지 않는다.
- 구현 세부사항에 과하게 의존하는 테스트를 만들지 않는다.
- flaky test를 방치하지 않는다.
- 플랫폼별 동작을 한쪽 simulator 결과만으로 완료 처리하지 않는다.
- happy path만 테스트하고 실패/빈 데이터/오프라인 상태를 생략하지 않는다.
- query/filter/sort/search validation 실패 케이스를 생략하지 않는다.
- 테스트가 어렵다는 이유로 business logic을 component 안에 숨기지 않는다.

## 판단 기준

- 계산, validation, formatting, state transition은 unit test 후보이다.
- 사용자 클릭, 입력, error 표시, loading 전환은 interaction test 후보이다.
- snapshot test는 의도적 markup 변화 감시에 제한적으로 사용한다.
- native 기능은 simulator와 실제 기기 검증 필요성을 구분한다.
- 외부 데이터 validation, failure state, lifecycle 시나리오는 재발 위험이 크면 test 또는 수동 검증 기록을 남긴다.
- backend contract가 필요한 query safety는 mock 또는 contract 문서 기준으로 parameterized query, server-side validation, authorization 기대사항을 검증한다.
- URL query, GraphQL variables, SDK query builder 사용 여부는 code review 체크 항목으로 다룬다.
- 현재 다국어를 지원하지 않더라도 긴 문장과 locale-sensitive formatting은 UI 깨짐 후보로 본다.
- 코드가 생긴 뒤에는 기존 test runner, naming, location을 우선 따른다.

## 체크리스트

- [ ] 핵심 business logic에 test가 있는가?
- [ ] 공통 component의 주요 interaction을 검증했는가?
- [ ] 버그 수정에 재발 방지 test가 포함되었는가?
- [ ] snapshot test를 남용하지 않았는가?
- [ ] iOS/Android 영향 범위를 검토했는가?
- [ ] responsive, accessibility, keyboard 동작을 확인했는가?
- [ ] loading, empty, error, offline, permission denied 상태를 확인했는가?
- [ ] timeout, invalid API response, expired token 시나리오를 확인했는가?
- [ ] lifecycle resume과 deep link 경로를 확인했는가?
- [ ] query/filter/sort/search params validation을 확인했는가?
- [ ] 잘못된 deep link/navigation params 처리를 확인했는가?
- [ ] URL encoding과 allowlist 밖의 값 처리를 확인했는가?
- [ ] GraphQL user input이 query string에 직접 삽입되지 않는지 확인했는가?
- [ ] raw user input이 logging/analytics에 그대로 들어가지 않는지 확인했는가?
- [ ] backend contract가 필요한 경우 mock 또는 문서 기준으로 검증했는가?
- [ ] 긴 텍스트, 날짜/시간/숫자, timezone 영향을 확인했는가?
