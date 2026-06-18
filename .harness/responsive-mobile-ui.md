# Responsive Mobile UI

## 목적

다양한 휴대폰 기종, 화면 크기, safe area, orientation, keyboard 상황에서도 UI가 깨지지 않고 읽고 조작하기 쉬운 상태를 유지한다.

## 해야 할 것

- 화면은 작은 기기부터 고려하고 큰 화면으로 확장한다.
- safe area, notch, Dynamic Island, status bar, navigation bar를 기본 제약으로 다룬다.
- `useWindowDimensions`처럼 화면 변화에 반응하는 값을 우선 사용한다.
- 고정 width/height보다 flex, percentage, min/max, spacing token을 우선 사용한다.
- text가 길어질 수 있는 영역은 wrapping, truncation, scroll 가능성을 설계한다.
- 버튼, 탭, 헤더 텍스트가 길어져도 레이아웃이 깨지지 않게 한다.
- 날짜, 시간, 숫자, 통화, timezone 표시는 locale 확장 가능성을 고려한다.
- 입력 화면은 keyboard 회피와 submit 흐름을 확인한다.
- 최소 touch target은 일반적으로 44x44pt 또는 그에 준하는 크기를 목표로 한다.
- tablet, foldable, orientation change는 layout이 무너지지 않는 수준으로 대비한다.

## 피해야 할 것

- 특정 기기 해상도에 맞춘 magic number를 남발하지 않는다.
- safe area를 무시하고 화면 끝에 핵심 버튼을 붙이지 않는다.
- keyboard가 올라왔을 때 primary action이 가려지는 상태를 방치하지 않는다.
- text scaling을 막기 위해 font scale 대응을 무조건 비활성화하지 않는다.
- 사용자에게 보이는 text를 화면 layout에 직접 박아 i18n 도입을 어렵게 만들지 않는다.
- scroll이 필요한 화면에서 고정 높이만으로 내용을 억지로 맞추지 않는다.

## 판단 기준

- 320px급 작은 화면에서도 핵심 정보와 primary action이 접근 가능해야 한다.
- 큰 화면에서는 내용이 과도하게 늘어나지 않도록 max width나 column layout을 검토한다.
- absolute positioning은 장식이나 overlay처럼 이유가 명확할 때만 사용한다.
- keyboard가 필요한 화면은 iOS와 Android 동작 차이를 모두 확인한다.
- 현재 다국어를 지원하지 않더라도 긴 문장, 줄바꿈, 작은 화면 overflow를 기본 위험으로 본다.
- 코드가 생긴 뒤에는 기존 responsive helper와 layout primitive를 우선 사용한다.

## 체크리스트

- [ ] 작은 화면에서 text와 button이 겹치지 않는가?
- [ ] 큰 화면에서 layout이 지나치게 퍼지지 않는가?
- [ ] safe area와 system bar를 고려했는가?
- [ ] keyboard가 primary action을 가리지 않는가?
- [ ] orientation 또는 window size 변경에 대응하는가?
- [ ] touch target이 충분한가?
- [ ] 긴 텍스트와 font scaling에 대응하는가?
- [ ] 버튼/탭/헤더 텍스트가 길어져도 깨지지 않는가?
- [ ] 날짜/시간/숫자/timezone 표시가 locale 확장 가능성을 막지 않는가?
