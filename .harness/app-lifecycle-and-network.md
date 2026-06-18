# App Lifecycle And Network

## 목적

React Native 모바일 앱에서 자주 발생하는 foreground/background 전환, network reconnect, auth 만료, push open, offline 상태를 안정적으로 처리하기 위한 원칙을 정의한다.

## 해야 할 것

- app foreground/background/resume 전환 시 어떤 데이터를 refresh할지 기준을 둔다.
- background에서 돌아왔을 때 민감 화면, 만료된 데이터, stale permission 상태를 재검증한다.
- auth token 만료, session 복원, 강제 logout 흐름을 명시적으로 설계한다.
- push notification open, deep link open, cold start, warm start 경로를 구분한다.
- network offline/online 전환 시 사용자에게 가능한 동작과 불가능한 동작을 명확히 보여준다.
- timeout, retry, cancellation, 중복 요청 방지 기준을 둔다.
- loading, refreshing, retrying, offline, stale data 상태를 구분한다.
- reconnect 후 자동 재시도 여부는 사용자 영향과 데이터 안정성을 기준으로 판단한다.
- navigation state와 auth state가 충돌하지 않게 한다.
- 프로젝트에서 React Navigation, TanStack Query 등 관련 도구를 채택한 경우 기존 lifecycle 처리 패턴을 따른다.

## 피해야 할 것

- resume 시 모든 API를 무조건 다시 호출하지 않는다.
- network 실패와 empty data를 같은 UI로 처리하지 않는다.
- expired token 상태에서 보호 화면을 계속 보여주지 않는다.
- push/deep link를 auth 상태 검증 전에 무조건 실행하지 않는다.
- offline 상태에서 저장되지 않을 action을 성공한 것처럼 보여주지 않는다.
- 요청 cancellation 없이 화면 이동 후 오래된 응답으로 state를 덮지 않는다.

## 판단 기준

- 사용자 데이터가 오래되면 위험한 화면은 foreground 복귀 시 재검증한다.
- 읽기 데이터는 stale 허용 시간을 둘 수 있지만 결제, 권한, 계정 상태는 보수적으로 검증한다.
- 자동 retry는 idempotent 요청과 사용자 피해가 없는 요청에 우선 적용한다.
- 쓰기 요청은 중복 전송, partial success, offline queue 필요성을 먼저 판단한다.
- cold start deep link는 초기 auth/session 복원 이후 처리한다.
- network 상태는 UI 차단이 아니라 가능한 행동 안내를 목적으로 사용한다.

## 체크리스트

- [ ] foreground/background/resume 시 refresh 기준이 있는가?
- [ ] auth 만료, session 복원, 강제 logout 흐름이 정의되어 있는가?
- [ ] push open, deep link open, cold start, warm start 경로를 구분했는가?
- [ ] offline, reconnect, timeout, retry 상태가 UI에 반영되는가?
- [ ] 중복 요청과 오래된 응답 덮어쓰기를 방지했는가?
- [ ] stale data와 refreshing 상태가 구분되는가?
- [ ] navigation state와 auth state 충돌을 방지했는가?

## 대표 시나리오

- 사용자가 앱을 30분 뒤 다시 열면 민감 데이터와 permission 상태를 재검증한다.
- expired token으로 API가 실패하면 조용히 재시도만 반복하지 말고 session 갱신 또는 login 이동을 처리한다.
- push notification으로 상세 화면을 열 때 auth 복원, payload 검증, route params 검증을 순서대로 수행한다.
- offline에서 작성 가능한 action은 저장 대기 상태를 표시하고, 불가능한 action은 이유와 재시도 방법을 보여준다.
- 화면을 떠난 뒤 도착한 응답은 현재 화면 state를 덮지 않게 cancellation 또는 request identity를 사용한다.
