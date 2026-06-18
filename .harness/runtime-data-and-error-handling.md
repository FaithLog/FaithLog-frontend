# Runtime Data And Error Handling

## 목적

TypeScript compile-time 타입만으로는 보장할 수 없는 외부 입력, 실패 상태, 데이터 경계 처리를 규칙화한다.

## 해야 할 것

- API 응답, API query params, search params, filter params, sort params, deep link params, navigation params, storage 복원 데이터, remote config, push payload는 타입 선언만 믿지 않는다.
- 외부 입력은 사용 전에 runtime validation, narrowing, fallback 처리를 거친다.
- validation 라이브러리는 프로젝트에서 채택된 경우에만 사용한다. 예: Zod.
- 서버 응답 DTO를 UI가 직접 의존하지 않게 한다.
- API DTO, domain model, screen view model을 필요에 따라 분리한다.
- 외부 입력이 API query로 전달되면 validation 후 API DTO/domain model/view model과 별도로 `safe query params` 또는 이에 준하는 안전한 형태로 변환한다.
- deep link params, navigation params, storage 복원 데이터, push payload가 API query에 영향을 주기 전 validation/narrowing을 수행한다.
- query injection / parameter injection 위험은 [injection-and-query-safety.md](injection-and-query-safety.md)를 따른다.
- 네트워크 실패, 권한 거부, 빈 데이터, 만료된 token, validation 실패, navigation 실패를 명시적인 UI 상태로 표현한다.
- async state와 validation state는 가능하면 `invalid | loading | success | empty | error` 같은 discriminated union으로 모델링한다.
- union 상태 처리 시 `never` 기반 exhaustive check를 사용한다.
- `null`, `undefined`, 빈 배열, 잘못된 enum 값, 알 수 없는 서버 필드를 방어적으로 처리한다.
- 실패 상태는 조용히 무시하지 말고 사용자가 재시도, 설정 이동, 로그인 갱신 등 복구 가능한 행동을 할 수 있게 한다.

## 피해야 할 것

- API 타입을 선언했다는 이유로 runtime 검증을 생략하지 않는다.
- `as` assertion으로 외부 입력을 곧바로 내부 타입으로 바꾸지 않는다.
- 서버 DTO를 화면 컴포넌트 props로 그대로 흘려보내지 않는다.
- 실패 상태를 `console.log`만 남기고 UI에서 숨기지 않는다.
- invalid param을 조용히 무시하지 않고 fallback, error state, safe default 중 하나로 처리한다.
- `null`, `undefined`, 빈 배열, 잘못된 enum을 같은 상태로 뭉개지 않는다.
- 알 수 없는 push payload나 deep link를 기본 화면으로 조용히 이동시키지 않는다.

## 판단 기준

- 앱 밖에서 들어오는 값은 모두 external boundary로 본다.
- external boundary 값이 API query에 영향을 주면 safe query params 변환 단계를 둔다.
- UI가 필요한 필드와 서버가 주는 필드가 다르면 view model로 변환한다.
- 복구 가능한 실패는 retry, permission 안내, login 갱신, fallback view를 제공한다.
- 복구 불가능한 실패는 안전한 화면으로 이동하고 사용자에게 이유를 설명한다.
- invalid/loading/empty/error/success처럼 상태가 3개 이상이면 discriminated union을 우선 검토한다.
- enum 또는 union 값이 외부에서 들어오면 unknown branch를 처리한다.

## 체크리스트

- [ ] API 응답, API query params, search/filter/sort params, storage, remote config, push payload를 검증했는가?
- [ ] deep link/navigation/storage/push payload가 API query에 영향을 주기 전 narrowing했는가?
- [ ] validation 후 safe query params 또는 이에 준하는 안전한 형태로 변환했는가?
- [ ] 외부 데이터가 DTO에서 domain 또는 view model로 변환되는가?
- [ ] invalid, loading, success, empty, error 상태가 구분되는가?
- [ ] permission denied, expired token, validation failure가 UI 상태로 표현되는가?
- [ ] `null`, `undefined`, 빈 배열, 잘못된 enum 값이 방어적으로 처리되는가?
- [ ] union 상태 처리에 exhaustive check가 있는가?
- [ ] 사용자가 실패 상태에서 복구할 방법을 제공하는가?

## 예시 타입 패턴

```ts
type AsyncState<T> =
  | {status: 'invalid'; reason: string}
  | {status: 'loading'}
  | {status: 'success'; data: T}
  | {status: 'empty'}
  | {status: 'error'; message: string; retryable: boolean};

function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${String(value)}`);
}

function renderState<T>(state: AsyncState<T>) {
  switch (state.status) {
    case 'invalid':
      return state.reason;
    case 'loading':
      return 'loading';
    case 'success':
      return state.data;
    case 'empty':
      return 'empty';
    case 'error':
      return state.message;
    default:
      return assertNever(state);
  }
}
```
