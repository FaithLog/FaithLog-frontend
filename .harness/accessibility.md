# Accessibility

## 목적

모바일 accessibility를 나중 보완이 아니라 컴포넌트 작성 시 기본 요구사항으로 다룬다.

## 해야 할 것

- 터치 가능한 요소에는 충분한 touch target을 제공한다.
- 아이콘 버튼에는 의미 있는 `accessibilityLabel`을 제공한다.
- 필요한 경우 `accessibilityRole`, `accessibilityHint`, state 정보를 제공한다.
- VoiceOver와 TalkBack의 동작 차이를 고려한다.
- text scaling과 Dynamic Type에 대응한다.
- 색상 대비를 확보하고 색상만으로 상태를 전달하지 않는다.
- form input은 label, error, helper text 관계가 screen reader에서 이해되게 한다.

## 피해야 할 것

- 아이콘만 있는 버튼을 label 없이 배포하지 않는다.
- decorative element를 screen reader가 읽게 방치하지 않는다.
- 작은 touch area를 padding 없이 그대로 두지 않는다.
- font scaling 때문에 layout이 깨진다고 무조건 scaling을 막지 않는다.
- error 상태를 색상 하나로만 표현하지 않는다.

## 판단 기준

- 사용자가 화면을 보지 않고도 주요 action을 이해하고 실행할 수 있어야 한다.
- custom component는 native component의 accessibility 의미를 잃지 않아야 한다.
- label은 화면 text를 반복하기보다 action이나 대상이 명확해야 한다.
- touch target은 최소 44x44pt 수준을 목표로 한다.
- 접근성 처리는 common component에 기본값으로 넣는 것을 우선한다.

## 체크리스트

- [ ] 모든 interactive element에 label 또는 명확한 text가 있는가?
- [ ] icon button에 `accessibilityLabel`이 있는가?
- [ ] role, hint, state가 필요한 곳에 제공되는가?
- [ ] touch target이 충분한가?
- [ ] font scaling 시 text가 겹치지 않는가?
- [ ] 색상 대비와 비색상 상태 표현이 충분한가?
