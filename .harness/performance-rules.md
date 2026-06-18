# Performance Rules

## 목적

React Native 앱이 iOS와 Android에서 부드럽게 동작하도록 rendering, list, image, animation, 초기 로딩 비용을 관리한다.

## 해야 할 것

- 불필요한 re-render를 줄이기 위해 state 위치를 작게 유지한다.
- 비싼 계산은 render 중 직접 수행하지 말고 memoization 또는 사전 계산을 검토한다.
- list는 데이터 양이 늘어날 수 있으면 `FlatList` 또는 `SectionList`를 우선 검토한다.
- list item에는 안정적인 key를 사용한다.
- item 높이가 예측 가능하면 `getItemLayout`을 검토한다.
- image는 적절한 크기, cache, placeholder, lazy loading 전략을 검토한다.
- animation과 gesture는 JS thread 부하를 고려한다.
- 초기 화면은 loading, skeleton, lazy loading 기준을 정한다.
- 새 dependency 추가 전 app size, native cost, startup impact를 검토한다.
- dependency 성능 영향은 [dependency-and-config-rules.md](dependency-and-config-rules.md)를 함께 따른다.

## 피해야 할 것

- 큰 배열을 `ScrollView`로 렌더링하지 않는다.
- render마다 새 object, 새 array, 새 function을 무분별하게 만들지 않는다.
- `memo`, `useMemo`, `useCallback`을 이유 없이 남발하지 않는다.
- release 성능을 dev mode 체감만으로 판단하지 않는다.
- production bundle에 과도한 `console.log`를 남기지 않는다.
- 단순 편의 기능 때문에 startup 비용이 큰 dependency를 추가하지 않는다.

## 판단 기준

- list item이 많거나 무한 스크롤 가능성이 있으면 virtualized list를 사용한다.
- memoization은 실제로 re-render 비용이 있거나 reference 안정성이 필요한 경우 사용한다.
- animation이 끊기면 JS thread 작업, image 크기, overdraw, layout thrashing을 의심한다.
- 성능 판단은 가능하면 release build와 실제 기기에서 확인한다.
- 프로젝트에서 Reanimated 등 animation 도구를 채택한 경우 해당 convention을 따른다.
- dependency가 native module을 포함하면 build time, app size, initialization 비용을 성능 비용으로 본다.

## 체크리스트

- [ ] state 위치가 필요한 범위로 제한되어 있는가?
- [ ] 큰 list에 virtualized list를 사용했는가?
- [ ] list key가 안정적인가?
- [ ] image 크기와 loading 전략을 검토했는가?
- [ ] render 중 expensive computation이 없는가?
- [ ] animation과 gesture가 JS thread를 과도하게 막지 않는가?
- [ ] dev mode만 보고 성능을 판단하지 않았는가?
- [ ] 새 dependency의 app size, native cost, startup impact를 검토했는가?
