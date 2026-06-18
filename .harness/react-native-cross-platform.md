# React Native Cross Platform

## 목적

React Native 앱을 iOS와 Android에서 최대한 같은 코드로 유지하되, 각 플랫폼의 UX와 OS 제약을 무시하지 않도록 한다.

## 해야 할 것

- 공통 구현을 기본값으로 삼고, 플랫폼 분기는 필요한 부분에만 국소적으로 둔다.
- 작은 차이는 `Platform.OS` 또는 `Platform.select`로 처리한다.
- 컴포넌트 전체 구조나 native 동작이 다르면 `.ios.tsx`, `.android.tsx` 같은 플랫폼별 파일을 검토한다.
- permission, file system, push notification, deep link, native module, background task는 플랫폼별 정책을 먼저 확인한다.
- iOS와 Android 모두에서 navigation, keyboard, status bar, safe area, back action 동작을 확인한다.
- 프로젝트에서 Expo를 채택한 경우 Expo workflow의 제약과 config 방식을 따른다.

## 피해야 할 것

- 단순 style 차이 때문에 플랫폼별 파일을 남발하지 않는다.
- iOS 기준 UX를 Android에 그대로 강제하거나, Android 기준 UX를 iOS에 그대로 강제하지 않는다.
- 플랫폼 전용 API를 공통 코드에서 직접 호출하면서 fallback을 두지 않는다.
- permission 요청을 앱 시작 시 한꺼번에 하지 않는다.
- native 설정이 필요한 기능을 JavaScript 코드만 보고 완료됐다고 판단하지 않는다.

## 판단 기준

- 같은 사용자 목적을 달성하지만 OS 기대 동작이 다르면 플랫폼별 UX를 허용한다.
- 코드 80% 이상이 같고 일부 값만 다르면 공통 컴포넌트 안에서 분기한다.
- rendering 구조, lifecycle, native API 호출 방식이 다르면 플랫폼별 파일을 사용한다.
- 플랫폼 분기가 3곳 이상 반복되면 공통 wrapper 또는 플랫폼별 컴포넌트 분리를 검토한다.

## 체크리스트

- [ ] iOS와 Android에서 같은 기능 경로가 동작하는가?
- [ ] 플랫폼 분기가 최소 범위에 머무르는가?
- [ ] 플랫폼별 파일을 만든 이유가 명확한가?
- [ ] permission, deep link, push, file system 같은 native 영역을 별도로 검토했는가?
- [ ] back button, keyboard, safe area, status bar 차이를 확인했는가?
- [ ] 채택된 라이브러리의 플랫폼별 설정 문서를 확인했는가?
