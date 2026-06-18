# Design System And Styling

## 목적

색상, spacing, typography, radius, shadow 같은 시각 규칙을 일관되게 유지하고, 임의 style 값이 쌓여 UI 품질이 흔들리지 않게 한다.

## 해야 할 것

- 프로젝트에 design token이 있으면 우선 사용한다.
- token이 아직 없으면 반복되는 값부터 색상, spacing, typography, radius 기준을 문서화하거나 상수화한다.
- Button, Text, Input, Card, Screen Container 같은 기본 UI 컴포넌트가 있으면 우선 사용한다.
- style 이름은 역할이 드러나게 작성한다. 예: `container`, `header`, `title`, `primaryAction`.
- dark mode와 theme 확장 가능성을 고려해 raw color 사용을 줄인다.
- 사용자에게 보이는 text hardcoding을 최소화하고, 향후 i18n 도입을 막는 구조를 피한다.
- 프로젝트에서 NativeWind 등 styling 도구를 채택한 경우 해당 도구의 기존 convention을 따른다.

## 피해야 할 것

- 비슷한 색상, spacing, font size를 매번 새 값으로 추가하지 않는다.
- 한 화면만 맞추기 위해 공통 component style을 깨지 않는다.
- shadow, radius, border를 장식적으로 과하게 늘리지 않는다.
- style 파일 위치와 naming을 기존 패턴과 다르게 임의로 만들지 않는다.
- dark mode를 고려해야 하는 값에 고정 light color를 직접 넣지 않는다.
- 긴 텍스트를 고려하지 않은 고정 폭 button, tab, header style을 만들지 않는다.

## 판단 기준

- 같은 의미의 UI 상태는 같은 token을 사용한다.
- 한 번만 쓰는 값이라도 제품 전반에 반복될 가능성이 있으면 token 후보이다.
- common component의 variant로 해결 가능하면 화면별 custom style보다 variant를 우선한다.
- platform-specific style은 native look and feel 또는 OS 제약이 있을 때 허용한다.
- typography와 spacing은 긴 문장, 줄바꿈, font scaling에서도 유지되는지 확인한다.
- 코드가 생긴 뒤에는 기존 design system과 style 위치를 우선 따른다.

## 체크리스트

- [ ] 기존 token 또는 공통 UI component를 확인했는가?
- [ ] 새 color, spacing, typography 값이 필요한 이유가 명확한가?
- [ ] style naming이 역할 중심인가?
- [ ] dark mode 또는 theme 확장 시 깨지지 않는가?
- [ ] 플랫폼별 style 차이가 필요한 이유가 있는가?
- [ ] 같은 UI 패턴이 화면마다 다르게 보이지 않는가?
- [ ] 긴 텍스트와 향후 i18n 도입을 고려했는가?
- [ ] 날짜/시간/숫자 같은 locale-sensitive text가 style을 깨지 않는가?
