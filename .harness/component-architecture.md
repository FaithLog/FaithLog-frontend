# Component Architecture

## 목적

컴포넌트를 작고 재사용 가능하게 나누고, 중복 UI와 중복 로직을 줄이며, 화면 구조와 비즈니스 로직이 과도하게 섞이지 않게 한다.

## 해야 할 것

- screen component는 routing, data loading 연결, 화면 조립을 담당하게 한다.
- feature component는 특정 기능 흐름과 도메인 UI를 담당하게 한다.
- common UI component는 Button, Text, Input, Card, Screen Container처럼 도메인과 분리된 표현을 담당하게 한다.
- 같은 UI 패턴이 2번 이상 반복되면 공통화 가능성을 검토한다.
- props는 필요한 값과 callback만 노출하고, 내부 구현 세부사항을 넘기지 않는다.
- `children`과 composition을 우선 사용해 확장 가능하게 만든다.
- business logic은 hook, service, utility 등 기존 프로젝트 패턴에 맞는 위치로 분리한다.
- 플랫폼별 차이가 큰 UI는 공통 interface를 유지하고 내부 구현만 분리한다.

## 피해야 할 것

- screen 하나에 data fetching, validation, formatting, rendering, navigation side effect를 모두 넣지 않는다.
- 이름만 다른 거의 같은 컴포넌트를 여러 개 만들지 않는다.
- props가 많아졌다는 이유만으로 무조건 전역 상태로 옮기지 않는다.
- common component가 특정 feature의 도메인 용어를 알게 하지 않는다.
- 플랫폼별 분기를 모든 하위 컴포넌트에 흩뿌리지 않는다.

## 판단 기준

- 재사용되는 UI가 의미와 상호작용까지 같으면 common component 후보이다.
- 모양만 비슷하고 도메인 의미가 다르면 composition이나 style variant를 먼저 검토한다.
- props가 7개 이상으로 늘거나 boolean flag가 여러 개면 컴포넌트 책임을 다시 나눈다.
- 플랫폼별 구현이 필요해도 외부 props 계약은 가능하면 동일하게 유지한다.
- 코드가 생긴 뒤에는 새 구조보다 기존 component 계층과 naming을 우선 따른다.

## 체크리스트

- [ ] 기존 컴포넌트로 해결 가능한지 확인했는가?
- [ ] 중복 UI를 공통화할지 판단했는가?
- [ ] screen, feature, common UI 책임이 구분되는가?
- [ ] props가 작고 명확한가?
- [ ] business logic과 rendering이 과도하게 섞이지 않았는가?
- [ ] 플랫폼 차이가 한곳에서 관리되는가?
