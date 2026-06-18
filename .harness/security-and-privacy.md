# Security And Privacy

## 목적

모바일 앱에서 secret, token, 사용자 개인정보, permission을 안전하게 다루고 불필요한 데이터 노출을 줄인다.

## 해야 할 것

- secret, API key, token을 source code에 하드코딩하지 않는다.
- 민감 정보는 log, error message, analytics event에 포함하지 않는다.
- local storage에는 필요한 데이터만 저장하고 민감도에 맞는 저장 방식을 선택한다.
- token 저장은 프로젝트에서 채택된 secure storage 방식을 따른다.
- permission은 필요한 시점에 최소 권한으로 요청한다.
- permission 요청 전 사용자가 이유를 이해할 수 있는 UX를 제공한다.
- 사용자 데이터는 최소 수집, 최소 보관, 목적 제한 원칙을 따른다.
- environment/config와 secret 관리는 [dependency-and-config-rules.md](dependency-and-config-rules.md)를 따른다.
- production logging은 환경별로 제한하고 민감 정보는 masking하거나 제외한다.
- query injection / parameter injection 상세 규칙은 [injection-and-query-safety.md](injection-and-query-safety.md)를 따른다.
- 사용자 입력을 query, filter, sort, search, analytics, logging으로 전달할 때는 신뢰하지 않고 validation, allowlist, masking을 적용한다.
- frontend validation은 보안의 최종 방어선이 아니며 backend/API layer의 parameterized query, authorization, server-side validation이 필요하다.

## 피해야 할 것

- `.env`, config, native plist/manifest에 실제 secret을 커밋하지 않는다.
- access token을 일반 async storage에 무조건 저장하지 않는다.
- permission을 앱 시작 시 전부 요청하지 않는다.
- debug log에 request header, token, email, phone number, location을 남기지 않는다.
- production log, crash report, analytics event에 민감 정보를 남기지 않는다.
- raw query, raw user input, token, email, phone number, 주소, 개인 식별자를 log나 analytics에 그대로 남기지 않는다.
- third-party SDK에 보내는 데이터 범위를 검토하지 않고 추가하지 않는다.

## 판단 기준

- 노출되면 계정 탈취나 개인정보 침해가 가능한 값은 민감 정보로 본다.
- permission 없이 기능을 설명하거나 제한된 대체 경로를 제공할 수 있으면 먼저 제공한다.
- 로컬 저장이 필요 없는 데이터는 memory state를 우선한다.
- API key가 public client에 포함될 수밖에 없다면 권한과 backend 제한을 함께 설계한다.
- 프로젝트에서 secure storage 라이브러리를 채택한 경우 기존 wrapper를 우선 사용한다.
- Sentry, Firebase Analytics 등은 프로젝트에서 채택된 경우에만 사용하고, 수집 데이터 범위를 최소화한다.
- frontend에서 숨긴 값, disabled control, local allowlist는 보안 경계가 아니며 서버 권한 검증으로 보강해야 한다.

## 체크리스트

- [ ] secret 또는 token이 코드에 하드코딩되지 않았는가?
- [ ] 민감 정보가 log와 analytics에 포함되지 않는가?
- [ ] local storage 사용 이유와 저장 범위가 명확한가?
- [ ] permission 요청 시점과 권한 범위가 최소인가?
- [ ] native config에 실제 secret이 커밋되지 않았는가?
- [ ] environment/config 변경이 [dependency-and-config-rules.md](dependency-and-config-rules.md)를 따르는가?
- [ ] production log와 crash report에서 민감 정보가 masking되는가?
- [ ] query/filter/sort/search, analytics, logging으로 전달되는 사용자 입력을 신뢰하지 않는가?
- [ ] query injection / parameter injection 검토가 [injection-and-query-safety.md](injection-and-query-safety.md)를 따르는가?
- [ ] backend/API layer의 parameterized query, authorization, validation 필요성을 확인했는가?
- [ ] 사용자 데이터 수집 목적이 명확하고 최소화되어 있는가?
