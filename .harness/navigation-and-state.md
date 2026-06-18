# Navigation And State

## 목적

navigation과 state를 역할별로 분리해 화면 흐름, 데이터 흐름, UI 상태가 뒤섞이지 않게 한다.

## 해야 할 것

- screen params는 TypeScript로 타입화한다.
- navigation route name과 params는 한곳에서 추적 가능하게 둔다.
- local state는 해당 컴포넌트 안에서만 필요한 UI 상태에 사용한다.
- 전역 상태는 여러 화면에서 공유되고 사용자 흐름에 중요한 상태에만 사용한다.
- 서버 상태는 cache, refetch, loading, error 정책이 필요하므로 UI state와 구분한다.
- form state는 validation, dirty, touched, submit 상태를 명확히 분리한다.
- 프로젝트에서 React Navigation, Zustand, TanStack Query 등을 채택한 경우 기존 패턴을 따른다.
- auth flow, modal navigation, deep link 확장 가능성을 고려한다.
- app lifecycle, auth resume, deep link state는 [app-lifecycle-and-network.md](app-lifecycle-and-network.md)를 따른다.
- navigation params 검증은 [runtime-data-and-error-handling.md](runtime-data-and-error-handling.md)를 따른다.

## 피해야 할 것

- 모든 상태를 전역 store에 넣지 않는다.
- navigation params에 큰 object나 민감 정보를 넣지 않는다.
- 검증되지 않은 deep link params를 곧바로 screen params로 사용하지 않는다.
- 서버 상태를 수동 전역 상태로 복제해 source of truth를 두 개 만들지 않는다.
- modal, auth, deep link 흐름을 임시 boolean만으로 억지로 처리하지 않는다.
- 상태를 끌어올릴 이유가 불명확한데 상위 컴포넌트로 이동하지 않는다.

## 판단 기준

- 한 컴포넌트에서만 쓰이면 local state를 우선한다.
- 형제 컴포넌트가 공유하면 가까운 공통 부모로 끌어올린다.
- 여러 화면에서 공유되면 context 또는 store를 검토한다.
- remote data라면 프로젝트에서 채택된 server state 도구를 우선 검토한다.
- navigation params는 화면 재진입과 deep link에서 복원 가능한 최소 정보만 담는다.
- auth state가 복원되기 전 보호 route로 이동해야 하면 대기 또는 안전한 fallback route를 사용한다.

## 체크리스트

- [ ] screen params가 타입화되어 있는가?
- [ ] local, global, server, form state가 구분되는가?
- [ ] source of truth가 하나인가?
- [ ] navigation params가 작고 안전한가?
- [ ] navigation params와 deep link params를 검증했는가?
- [ ] auth, modal, deep link 흐름에 무리가 없는가?
- [ ] lifecycle resume과 auth state 충돌을 검토했는가?
- [ ] 채택된 state/navigation 라이브러리 convention을 따르는가?
