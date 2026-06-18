# TypeScript Rules

## 목적

TypeScript를 strict 기준의 설계 도구로 사용해 잘못된 상태와 잘못된 데이터 흐름을 최대한 컴파일 단계에서 막는다.

## 해야 할 것

- `strict` 기준으로 타입을 작성한다.
- `unknown`은 외부 입력, API 응답, storage 데이터처럼 신뢰 경계에서 사용하고 narrowing 후 접근한다.
- nullable과 optional은 의미를 구분한다. 없을 수 있는 값은 optional, 명시적 빈 상태는 `null`을 검토한다.
- 상태 종류가 여러 개인 UI는 discriminated union으로 표현한다.
- union 상태는 가능한 한 `never` 기반 exhaustive check로 처리 누락을 막는다.
- API response type, domain model, UI view model을 필요에 따라 분리한다.
- 외부 데이터 boundary와 runtime validation은 [runtime-data-and-error-handling.md](runtime-data-and-error-handling.md)를 따른다.
- component props는 `Props` 또는 컴포넌트명 기반 type/interface로 명확히 정의한다.
- callback type은 인자와 반환값을 명확히 표현한다.

## 피해야 할 것

- `any`를 기본 탈출구로 사용하지 않는다.
- API 응답 타입을 검증 없이 UI 내부 타입으로 그대로 믿지 않는다.
- boolean flag 여러 개로 불가능한 상태 조합을 만들지 않는다.
- `loading`, `error`, `empty`, `success` 같은 상태를 nullable data와 boolean 조합으로 흐리게 만들지 않는다.
- `as` assertion으로 타입 오류를 덮지 않는다.
- type 정의를 너무 멀리 분산해 읽기 어렵게 만들지 않는다.

## 판단 기준

- `any`는 third-party type 누락, 점진 migration, 타입 시스템으로 표현이 어려운 경계에서만 허용하고 이유를 남긴다.
- `type`과 `interface`는 프로젝트 기존 convention을 우선한다.
- union member는 화면 상태, permission 상태, async 상태처럼 경우의 수가 명확할 때 사용한다.
- runtime validation이 필요한 데이터는 TypeScript 타입만으로 안전하다고 보지 않는다.
- API DTO, domain model, screen view model은 변경 이유가 다르면 분리한다.
- 코드가 생긴 뒤에는 기존 `tsconfig`, lint rule, type naming을 우선 따른다.

## 체크리스트

- [ ] `any` 없이 표현했는가?
- [ ] 외부 데이터에 narrowing 또는 validation이 있는가?
- [ ] optional과 nullable 의미가 구분되는가?
- [ ] 불가능한 상태 조합을 타입으로 막았는가?
- [ ] union 상태에 exhaustive handling이 있는가?
- [ ] API 타입과 UI 타입을 분리할 필요를 검토했는가?
- [ ] 외부 데이터 boundary를 [runtime-data-and-error-handling.md](runtime-data-and-error-handling.md)에 맞게 처리했는가?
- [ ] props와 callback type이 명확한가?
