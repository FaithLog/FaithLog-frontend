# Dependency And Config Rules

## 목적

모바일 앱에서 dependency, native module, environment config, build config 변경이 앱 빌드와 배포 안정성에 미치는 영향을 관리한다.

## 해야 할 것

- 새 dependency 추가 전 기존 dependency나 간단한 내부 구현으로 대체 가능한지 확인한다.
- native dependency는 단순 JavaScript dependency보다 더 엄격하게 검토한다.
- iOS Pod, Android Gradle, app size, startup impact, build time 영향을 확인한다.
- dependency의 유지보수 상태, TypeScript 지원, iOS/Android platform support를 확인한다.
- Expo를 프로젝트에서 채택한 경우 compatibility와 config plugin 필요 여부를 확인한다.
- dev/staging/prod endpoint를 코드에 흩뿌리지 않고 중앙화된 config 원칙을 따른다.
- feature flag, app scheme, bundle id, package name, API base URL은 한곳에서 추적 가능하게 관리한다.
- production logging, crash reporting, analytics 설정은 환경별로 분리한다.
- 프로젝트에서 Sentry, Firebase Analytics 등 observability 도구를 채택한 경우 기존 설정과 naming convention을 따른다.

## 피해야 할 것

- 작은 utility 때문에 큰 dependency를 추가하지 않는다.
- native 설정이 필요한 dependency를 JavaScript 설치만으로 완료 처리하지 않는다.
- dev/staging/prod 값을 화면 코드나 service 코드에 직접 하드코딩하지 않는다.
- secret, token, private key를 repository에 커밋하지 않는다.
- production log에 민감 정보를 남기지 않는다.
- analytics event 이름을 화면마다 임의로 만들지 않는다.

## dependency 추가 판단 기준

- 유지보수 상태: 최근 release, issue 대응, 커뮤니티 사용성을 확인한다.
- TypeScript 지원: 자체 type 제공 여부와 type 품질을 확인한다.
- platform support: iOS/Android 양쪽 지원과 알려진 제한을 확인한다.
- native config: Pod, Gradle, manifest, plist, permission, config plugin 필요 여부를 확인한다.
- 크기와 성능: app size, bundle size, startup impact, memory 영향을 검토한다.
- Expo compatibility: 프로젝트에서 Expo를 채택한 경우 managed/prebuild/dev client 영향을 확인한다.
- 대체 가능성: 이미 설치된 dependency나 작은 내부 함수로 해결 가능한지 확인한다.

## environment/config 관리 기준

- API base URL, app scheme, bundle id, package name, feature flag는 중앙 config에서 관리한다.
- config 이름은 환경별 의미가 드러나게 작성한다.
- runtime에 바뀌는 remote config와 build-time config를 구분한다.
- config 변경은 iOS/Android build, deep link, push, release channel, store 배포 영향을 함께 검토한다.
- secret은 repository가 아니라 안전한 secret 관리 경로를 사용한다.

## logging/observability 기준

- log level은 development, staging, production 환경별로 다르게 둔다.
- 민감 정보는 logging, crash report, analytics event에서 masking하거나 제외한다.
- analytics event naming은 일관된 동사와 대상 규칙을 사용한다.
- crash reporting은 사용자 식별자와 개인정보 수집 범위를 최소화한다.
- production log는 문제 해결에 필요한 최소 정보만 남긴다.

## 체크리스트

- [ ] 새 dependency가 꼭 필요한 이유가 명확한가?
- [ ] 기존 dependency 또는 내부 구현으로 대체할 수 없는가?
- [ ] TypeScript 지원과 iOS/Android platform support를 확인했는가?
- [ ] native config, Pod, Gradle, permission, Expo compatibility를 확인했는가?
- [ ] app size, bundle size, startup impact를 검토했는가?
- [ ] dev/staging/prod config가 중앙화되어 있는가?
- [ ] secret, token, private key가 repository에 들어가지 않는가?
- [ ] production logging과 analytics에서 민감 정보가 제외되는가?
