# FaithLog 전체 QA 시나리오

작성일: 2026-06-30
목적: 새 캠퍼스를 처음부터 만들고, 관리자/매니저/일반 사용자 흐름을 실제 운영 데이터처럼 검증한다.
대상 앱 환경: preview/API Cloud Run 또는 QA 빌드
주의: 기존 운영 데이터가 아닌 이 문서의 QA 캠퍼스/QA 계정으로만 생성, 종료, 삭제, 비활성화 액션을 수행한다.

## 공통 원칙

- 각 QA 세션은 독립 실행 가능하게 나눴지만, `세션 00 -> 01 -> 02`는 최초 환경 구축 순서대로 먼저 진행한다.
- 이메일은 충돌 방지를 위해 `{TS}`에 `YYYYMMDDHHmm` timestamp를 넣는다.
- 새로 만드는 QA 계정 비밀번호는 모두 `Qa!{TS}`로 통일한다. 예: `{TS}=202606301430`이면 `Qa!202606301430`.
- 전역 ADMIN 비밀번호는 별도 안전 채널의 값을 사용하고, 문서나 로그에 남기지 않는다.
- 생성한 데이터는 마지막 세션에서 목록화한다.
- 실제 종료/삭제/비활성화는 이 문서에서 만든 QA 캠퍼스 데이터에 한해서만 실행한다.
- 실패 시 화면 캡처, 계정, 캠퍼스, API endpoint, status, response body를 기록한다.
- QA 완료 판정은 기능 통과뿐 아니라 아래 API 커버리지 표의 `실행 결과`가 모두 채워졌는지로 판단한다.
- 알림/FCM은 아직 네이티브 연결 전이므로 이번 전체 QA에서 제외한다.

## API 커버리지 기준

기준:
- 1차 기준: `/Users/josephuk77/FaithLog/src/docs/asciidoc/index.adoc`
- 2차 보강: 현재 프론트 API client에 연결된 endpoint
- 알림 제외:
  - `POST /api/v1/users/me/fcm-tokens`
  - `DELETE /api/v1/users/me/fcm-tokens/{tokenId}`
  - `GET /api/v1/admin/campuses/{campusId}/notification-logs`
  - `POST /api/v1/admin/campuses/{campusId}/notifications`
  - 투표 미응답자 알림 발송 API
- 백엔드 `index.adoc`에는 현재 인증/캠퍼스/경건/정산/서비스관리까지만 보이고, 투표/커피/기도 API는 프론트 client/source 기준으로 보강했다. QA 중 배포 API와 다르면 endpoint/status/body를 기록한다.

### API 실행 매트릭스

| 영역 | API | 실행 세션 | 실행 방식 | 실행 결과 |
| --- | --- | --- | --- | --- |
| Health | `GET /api/v1/health` | 00 | 직접 호출 |  |
| Auth | `POST /api/v1/auth/signup` | 01, 03 | UI 회원가입 |  |
| Auth | `POST /api/v1/auth/login` | 00, 01, 03, 11 | UI 로그인 |  |
| Auth | `POST /api/v1/auth/refresh` | 00, 12 | 세션 유지/토큰 만료 직전 재시도 또는 직접 호출 |  |
| Auth | `POST /api/v1/auth/logout` | 11 | UI 로그아웃 |  |
| Users | `GET /api/v1/users/me` | 00, 01, 11 | 로그인 후 자동 호출 |  |
| Campuses | `POST /api/v1/campuses` | 02 | UI 캠퍼스 생성 |  |
| Campuses | `POST /api/v1/campuses/join` | 03 | UI 초대코드 참여 |  |
| Campuses | `GET /api/v1/campuses/me` | 01, 02, 03 | 로그인/캠퍼스 전환 |  |
| Campuses | `GET /api/v1/campuses/{campusId}` | 02, 03 | 캠퍼스 상세/초대코드 확인 |  |
| Campuses | `PATCH /api/v1/campuses/{campusId}` | 02, 10 | Service ADMIN 캠퍼스 수정 |  |
| Campuses | `DELETE /api/v1/campuses/{campusId}/members/{membershipId}` | 10 | QA용 임시 멤버 제거 |  |
| Service Admin | `GET /api/v1/admin/users` | 01 | 사용자 검색/페이지 이동 |  |
| Service Admin | `GET /api/v1/admin/users/{userId}` | 01 | 사용자 상세 |  |
| Service Admin | `PATCH /api/v1/admin/users/{userId}/role` | 01 | USER -> MANAGER 승급 |  |
| Service Admin | `GET /api/v1/admin/campuses` | 02, 10 | Service ADMIN 캠퍼스 목록 |  |
| Service Admin | `POST /api/v1/admin/campuses/{campusId}/members` | 10 | QA 사용자 C 재추가/직접 추가 |  |
| Admin Members | `GET /api/v1/admin/campuses/{campusId}/members` | 03 | 관리자 멤버 목록 |  |
| Admin Members | `PATCH /api/v1/admin/campuses/{campusId}/members/{campusMemberId}/campus-role` | 10, 11 | 캠퍼스 역할 변경 |  |
| Duty | `GET /api/v1/campuses/{campusId}/duty-assignments/me` | 07 | 커피담당자 탭 표시 확인 |  |
| Duty | `GET /api/v1/admin/campuses/{campusId}/duty-assignments` | 07 | 커피담당 목록 |  |
| Duty | `PUT /api/v1/admin/campuses/{campusId}/duty-assignments/coffee` | 07 | 커피담당 지정 |  |
| Duty | `DELETE /api/v1/admin/campuses/{campusId}/duty-assignments/coffee/{assignmentId}` | 10 | QA 담당 해제 |  |
| Devotion | `GET /api/v1/campuses/{campusId}/devotions/me/weeks/{weekStartDate}` | 05 | 경건 주간 화면 |  |
| Devotion | `PUT /api/v1/campuses/{campusId}/devotions/me/days/{recordDate}` | 05 | 하루 체크 저장 |  |
| Devotion | `PUT /api/v1/campuses/{campusId}/devotions/me/weeks/{weekStartDate}` | 05 | 주간 저장/제출 |  |
| Devotion | `GET /api/v1/campuses/{campusId}/devotions/me/monthly-summary` | 05 | 홈/월간 캘린더 |  |
| Devotion | `GET /api/v1/admin/campuses/{campusId}/devotions/missing` | 05 | 관리자 미제출자 |  |
| Penalty Rules | `GET /api/v1/campuses/{campusId}/penalty-rules` | 04 | 규칙 목록 |  |
| Penalty Rules | `POST /api/v1/admin/campuses/{campusId}/penalty-rules` | 04 | 규칙 생성 |  |
| Penalty Rules | `PATCH /api/v1/admin/penalty-rules/{ruleId}` | 04 | 규칙 수정 |  |
| Billing | `POST /api/v1/admin/campuses/{campusId}/payment-accounts` | 04, 07 | 정산/커피 계좌 등록 |  |
| Billing | `GET /api/v1/campuses/{campusId}/payment-accounts` | 04, 07 | 계좌 목록/투표 계좌 선택 |  |
| Billing | `PATCH /api/v1/admin/payment-accounts/{accountId}/deactivate` | 10 | QA 계좌 비활성화 |  |
| Billing | `GET /api/v1/campuses/{campusId}/charges/me` | 05, 07 | 내 청구 목록 |  |
| Billing | `GET /api/v1/campuses/{campusId}/charges/me/summary` | 05, 07 | 홈/청구 요약 |  |
| Billing | `PATCH /api/v1/campuses/{campusId}/charges/me/{chargeItemId}/paid` | 05, 10 | 사용자 납부 처리 |  |
| Billing | `GET /api/v1/admin/campuses/{campusId}/charges` | 04, 05, 07 | 관리자 청구 목록 |  |
| Billing | `GET /api/v1/admin/campuses/{campusId}/members/{userId}/charges` | 05, 07 | 멤버별 청구 상세 |  |
| Billing | `PATCH /api/v1/admin/charges/{chargeItemId}/status` | 10 | QA 청구 상태 변경 |  |
| Coffee | `GET /api/v1/coffee-brands` | 07 | 커피 메뉴 모달 |  |
| Coffee | `GET /api/v1/coffee-brands/{brandId}/menus` | 07 | 브랜드별 메뉴 선택 |  |
| Poll User | `GET /api/v1/campuses/{campusId}/polls` | 06, 07, 08 | 사용자/관리자 투표 목록 |  |
| Poll User | `GET /api/v1/campuses/{campusId}/polls/{pollId}` | 06, 07 | 투표 상세 |  |
| Poll User | `PUT /api/v1/campuses/{campusId}/polls/{pollId}/responses/me` | 06, 07, 08 | 응답 저장 |  |
| Poll User | `POST /api/v1/campuses/{campusId}/polls/{pollId}/options` | 06, 07 | 사용자 항목 추가 |  |
| Poll User | `GET /api/v1/campuses/{campusId}/polls/{pollId}/results` | 06, 07 | 결과 조회 |  |
| Poll Comment | `GET /api/v1/campuses/{campusId}/polls/{pollId}/comments` | 06 | 댓글 목록 |  |
| Poll Comment | `POST /api/v1/campuses/{campusId}/polls/{pollId}/comments` | 06 | 댓글 작성 |  |
| Poll Comment | `PATCH /api/v1/campuses/{campusId}/polls/{pollId}/comments/{commentId}` | 06 | 댓글 수정 |  |
| Poll Comment | `DELETE /api/v1/campuses/{campusId}/polls/{pollId}/comments/{commentId}` | 06 | QA 댓글 삭제 |  |
| Poll Admin | `GET /api/v1/admin/campuses/{campusId}/poll-templates` | 08 | 반복투표 목록 |  |
| Poll Admin | `GET /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}` | 08 | 템플릿 상세 |  |
| Poll Admin | `POST /api/v1/admin/campuses/{campusId}/poll-templates` | 08 | 반복투표 생성 |  |
| Poll Admin | `PATCH /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}` | 08 | 템플릿 수정 |  |
| Poll Admin | `DELETE /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}` | 10 | QA 템플릿 삭제 |  |
| Poll Admin | `POST /api/v1/admin/campuses/{campusId}/polls` | 06, 07 | 투표/커피투표 생성 |  |
| Poll Admin | `PATCH /api/v1/admin/campuses/{campusId}/polls/{pollId}/close` | 06, 07 | QA 투표 종료 |  |
| Poll Admin | `GET /api/v1/admin/campuses/{campusId}/polls/{pollId}/missing-members` | 06 | 미응답자 조회 |  |
| Admin Dashboard | `GET /api/v1/admin/campuses/{campusId}/dashboard/summary` | 02, 05 | 관리자 홈 요약 |  |
| Prayer Admin | `GET /api/v1/admin/campuses/{campusId}/prayer-seasons/current` | 09 | 현재 운영 기간 조회 |  |
| Prayer Admin | `POST /api/v1/admin/campuses/{campusId}/prayer-seasons` | 09 | 운영 기간 시작 |  |
| Prayer Admin | `PATCH /api/v1/admin/prayer-seasons/{seasonId}/close` | 09 | 운영 종료 |  |
| Prayer Admin | `GET /api/v1/admin/prayer-seasons/{seasonId}/groups` | 09 | 조 목록 |  |
| Prayer Admin | `POST /api/v1/admin/prayer-seasons/{seasonId}/groups` | 09 | 조 생성 |  |
| Prayer Admin | `PATCH /api/v1/admin/prayer-groups/{groupId}` | 09 | 조 이름/활성 수정 |  |
| Prayer Admin | `GET /api/v1/admin/prayer-seasons/{seasonId}/members/assignable` | 09 | 배정 가능 멤버 |  |
| Prayer Admin | `PUT /api/v1/admin/prayer-groups/{groupId}/members` | 09 | 조원 저장 |  |
| Prayer User | `GET /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}` | 09 | 조별 기도제목 조회 |  |
| Prayer User | `PUT /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}/me` | 09 | 내 기도제목 저장 |  |
| Prayer User | `PUT /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}/submissions` | 09, 10 | 관리자/직접 bulk 저장 확인 |  |

### 직접 호출이 필요한 API

아래 API는 UI가 없거나 UI 진입이 불명확할 수 있다. 앱 UI에서 실행 경로를 찾으면 UI로 실행하고, 없으면 QA 세션에서 curl/REST client로 직접 호출한 뒤 결과를 기록한다.

- `GET /api/v1/health`
- `POST /api/v1/auth/refresh`
- `PATCH /api/v1/campuses/{campusId}`
- `POST /api/v1/admin/campuses/{campusId}/members`
- `DELETE /api/v1/campuses/{campusId}/members/{membershipId}`
- `DELETE /api/v1/admin/campuses/{campusId}/duty-assignments/coffee/{assignmentId}`
- `PATCH /api/v1/admin/payment-accounts/{accountId}/deactivate`
- `PATCH /api/v1/admin/charges/{chargeItemId}/status`
- `DELETE /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`
- `PUT /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}/submissions`

직접 호출 기록 형식:

```md
- API:
- 계정/권한:
- request:
- status:
- response 요약:
- UI 반영 여부:
```

## 공통 테스트 데이터

### 계정

새로 가입하는 QA 계정은 모두 같은 timestamp를 넣은 `Qa!{TS}` 비밀번호를 사용한다. 세션을 나눠 진행할 때도 같은 `{TS}` 값을 공유해야 재로그인이 가능하다.

| 역할 | 이름 | 이메일 예시 | 비밀번호 |
| --- | --- | --- | --- |
| 전역 ADMIN | 기존 전역 관리자 | `josephuk77@naver.com` | 별도 안전 채널 |
| 승급 대상 매니저 | 김도윤 | `faithlog.qa.manager.{TS}@example.com` | `Qa!{TS}` |
| 일반 사용자 A | 이하은 | `faithlog.qa.user.haeun.{TS}@example.com` | `Qa!{TS}` |
| 일반 사용자 B | 정민수 | `faithlog.qa.user.minsu.{TS}@example.com` | `Qa!{TS}` |
| 일반 사용자 C | 최서연 | `faithlog.qa.user.seoyeon.{TS}@example.com` | `Qa!{TS}` |

### 캠퍼스

- 캠퍼스 이름: `새빛교회 청년부 판교캠퍼스 {TS}`
- 캠퍼스 설명: `주일 2부 예배 후 청년부 소그룹 경건 생활과 정산을 관리하는 QA 캠퍼스`
- 초대코드: 캠퍼스 생성 후 관리자 멤버 관리 화면에서 복사한다.

### 계좌

| 구분 | 은행 | 계좌번호 | 예금주 | 닉네임 |
| --- | --- | --- | --- | --- |
| 기본 정산 | 토스뱅크 | `1000-2026-0630` | 김도윤 | `청년부 정산 계좌` |
| 커피 정산 | 카카오뱅크 | `3333-06-3026` | 김도윤 | `카페 모임 정산 계좌` |

### 커피 메뉴

| 메뉴 | 가격 |
| --- | ---: |
| 아메리카노 | 2,500원 |
| 카페라떼 | 3,500원 |
| 바닐라라떼 | 4,000원 |
| 허브티 | 3,000원 |

### 기도조

| 조 이름 | 조원 |
| --- | --- |
| 믿음 1조 | 이하은, 정민수 |
| 소망 2조 | 최서연 |

### 기도제목

- 이하은: `새 학기 팀 프로젝트에서 지혜롭게 소통하고, 매일 말씀 묵상을 놓치지 않도록 기도해주세요.`
- 정민수: `직장 부서 이동을 앞두고 두려움보다 감사로 준비할 수 있도록 기도해주세요.`
- 최서연: `가족 예배가 회복되고 주일 섬김을 기쁘게 감당하도록 기도해주세요.`

## 세션 00. 환경 준비와 기준 확인

목표: QA 실행 전 앱/브랜치/서버/API 환경을 확정한다.

준비:
- 브랜치: `develop`
- 앱 환경:
  - `EXPO_PUBLIC_APP_ENV=preview`
  - `EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app`
- 기기:
  - iPhone Simulator 1대
  - 가능하면 실제 Android/iOS 기기 1대씩

절차:
1. `git status --short --branch`로 작업트리 확인.
2. `GET /api/v1/health`를 직접 호출해 배포 API 상태를 확인한다.
3. QA 미추적 파일이 있으면 건드리지 않는다.
4. 앱을 새 번들로 실행한다.
5. 로그인 화면, 회원가입 화면, 초대코드 화면 진입 여부를 확인한다.
6. 전역 ADMIN 계정 로그인 가능 여부를 확인한다.
7. 로그인 상태에서 앱을 충분히 유지하거나 직접 호출로 `POST /api/v1/auth/refresh` 동작을 확인한다.

기대 결과:
- 앱이 preview API로 뜬다.
- 전역 ADMIN이 일반 사용자 화면과 관리자/Service ADMIN 진입 흐름을 볼 수 있다.
- 화면 상단/하단바가 잘리지 않는다.

기록:
- 앱 URL/포트:
- 기기:
- 실행 시간:
- health API status:
- refresh API status:
- 이슈:

## 세션 01. 신규 매니저 계정 생성과 승급

목표: 처음부터 매니저 계정을 만들고 전역 ADMIN으로 MANAGER 승급을 검증한다.

사용 계정:
- 생성: 김도윤 `faithlog.qa.manager.{TS}@example.com`
- 승인/승급: 전역 ADMIN

절차:
1. 로그아웃 상태에서 김도윤 계정을 회원가입한다.
2. 김도윤으로 로그인해 기본 일반 사용자 화면만 보이는지 확인한다.
3. 로그아웃한다.
4. 전역 ADMIN으로 로그인한다.
5. Service ADMIN > 사용자 탭으로 이동한다.
6. 이메일 `faithlog.qa.manager.{TS}@example.com`로 검색한다.
7. 사용자 상세에서 역할을 `MANAGER`로 변경한다.
8. 김도윤 계정으로 다시 로그인한다.
9. 일반 사용자 홈에서 `관리자` 진입 버튼이 보이는지 확인한다.

기대 결과:
- 신규 계정은 처음에는 일반 사용자 권한이다.
- 전역 ADMIN 사용자 조회에서 10개 단위 pagination과 role filter가 정상 작동한다.
- MANAGER 승급 후 김도윤은 관리자 진입이 가능하다.
- 전역 ADMIN 화면의 `내정보` 탭에서 로그아웃 가능하다.

예외 확인:
- 이미 존재하는 이메일로 회원가입 시 중복 오류가 inline으로 보인다.
- 잘못된 비밀번호 로그인 시 세션이 깨지지 않고 오류가 보인다.

기록:
- 생성한 매니저 이메일:
- 승급 전 role:
- 승급 후 role:
- 이슈:

## 세션 02. 매니저 캠퍼스 생성과 기본 관리자 구조 확인

목표: 매니저 계정으로 새 캠퍼스를 만들고 관리자 기본 IA를 검증한다.

사용 계정:
- 김도윤 MANAGER

절차:
1. 김도윤으로 로그인한다.
2. 캠퍼스 생성 화면으로 이동한다.
3. `새빛교회 청년부 판교캠퍼스 {TS}`를 생성한다.
4. 생성 후 사용자 홈으로 이동하는지 확인한다.
5. Service ADMIN 또는 관리자 경로에서 `PATCH /api/v1/campuses/{campusId}`가 실행되도록 캠퍼스 설명을 `QA 통합 회귀 테스트 캠퍼스`로 수정한다.
6. 관리자 화면으로 진입한다.
7. 하단바 `홈 / 멤버 / 경건 / 투표 / 정산`을 각각 눌러 이동한다.
8. 관리자 홈에서 `GET /api/v1/admin/campuses/{campusId}/dashboard/summary`가 실행되는지 확인한다.
9. 멤버 > 멤버에서 초대코드 복사 row가 보이는지 확인한다.
10. 초대코드를 기록한다.
11. 멤버 > 역할, 멤버 > 커피담당 화면이 분리되어 있는지 확인한다.

기대 결과:
- 새 캠퍼스 생성 후 김도윤은 해당 캠퍼스의 관리 권한을 가진다.
- 관리자 하단바가 잘리지 않고 각 페이지가 분리되어 보인다.
- 초대코드 복사 동작 후 작은 `복사됨` 피드백이 나온다.
- 일반 사용자 화면 왼쪽 상단에는 지역명이 아닌 캠퍼스 이름만 보인다.

예외 확인:
- 빈 캠퍼스 이름 생성 시 validation 오류.
- 너무 긴 캠퍼스 이름은 UI에서 한 줄 ellipsis 또는 적절한 축약.

기록:
- 캠퍼스 ID:
- 캠퍼스 이름:
- 초대코드:
- campus update 결과:
- dashboard summary 결과:
- 이슈:

## 세션 03. 일반 사용자 가입, 캠퍼스 참여, 멤버 확인

목표: 일반 사용자를 만들고 초대코드로 캠퍼스에 참여시킨 뒤 멤버 관리에 반영되는지 확인한다.

사용 계정:
- 이하은, 정민수, 최서연 신규 일반 사용자
- 김도윤 MANAGER

절차:
1. 이하은 계정을 회원가입한다.
2. 초대코드로 `새빛교회 청년부 판교캠퍼스 {TS}`에 참여한다.
3. 정민수, 최서연도 같은 방식으로 참여시킨다.
4. 김도윤으로 로그인한다.
5. 관리자 > 멤버 > 멤버에서 3명이 보이는지 확인한다.
6. 검색으로 `이하은`, `정민수`, `최서연`을 각각 찾는다.
7. 멤버 상세가 있으면 사용자 이메일/역할 표시를 확인한다.
8. Service ADMIN 또는 관리자 API 보강 세션에서 `POST /api/v1/admin/campuses/{campusId}/members`로 QA용 예비 멤버 1명을 추가할 수 있는지 확인한다.

기대 결과:
- 일반 사용자는 관리자 진입 버튼이 보이지 않는다.
- 초대코드 참여 후 사용자 홈에 해당 캠퍼스명이 보인다.
- 관리자 멤버 목록에 새 사용자가 반영된다.

예외 확인:
- 잘못된 초대코드 입력 시 캠퍼스 참여 실패 메시지.
- 같은 초대코드 중복 참여 시 중복 상태가 명확히 보인다.

기록:
- 일반 사용자 이메일:
- 참여 성공 여부:
- 멤버 목록 반영 여부:
- admin member add 결과:
- 이슈:

## 세션 04. 정산 기본 설정과 계좌 등록

목표: 관리자 정산 화면에서 기본 계좌와 벌금 규칙을 설정한다.

사용 계정:
- 김도윤 MANAGER

절차:
1. 관리자 > 정산 > 계좌로 이동한다.
2. 기본 정산 계좌를 등록한다.
   - 은행: 토스뱅크
   - 계좌번호: `1000-2026-0630`
   - 예금주: 김도윤
   - 닉네임: `청년부 정산 계좌`
3. 등록 후 계좌 목록에 즉시 표시되는지 확인한다.
4. 관리자 > 정산 > 규칙으로 이동한다.
5. 경건 체크 벌금 규칙을 확인 또는 설정한다.
   - 큐티 미제출: 1,000원
   - 말씀 미제출: 1,000원
   - 기도 미제출: 1,000원
   - 토요일 지각: 500원
6. 관리자 > 정산 > 청구에서 필터/회원별 요약 UI를 확인한다.
7. 생성한 규칙 중 하나를 금액만 1회 수정해 `PATCH /api/v1/admin/penalty-rules/{ruleId}`를 확인한다.

기대 결과:
- 계좌 등록 후 목록 새로고침 없이 보인다.
- 계좌 카드/row가 모바일에서 겹치지 않는다.
- 벌금 규칙 저장 후 다시 들어와도 유지된다.
- 권한 오류가 발생해도 로그아웃으로 튕기지 않고 inline 오류가 보인다.

예외 확인:
- 빈 계좌번호, 빈 예금주, 잘못된 금액 입력.
- 계좌 삭제/비활성화는 QA 계좌에 한해 확인한다.

기록:
- 등록 계좌 ID:
- 벌금 규칙 저장 결과:
- 벌금 규칙 수정 결과:
- 이슈:

## 세션 05. 경건 체크와 벌금 청구 생성

목표: 일반 사용자 경건 체크와 벌금/청구 화면 흐름을 검증한다.

사용 계정:
- 이하은 일반 사용자
- 김도윤 MANAGER

테스트 날짜:
- QA 당일 주차
- 가능하면 토요일 지각/다음 주 자동 이동 케이스는 날짜 조작 없이 UI 표시까지만 확인

절차:
1. 이하은으로 로그인한다.
2. 경건생활 화면에 진입한다.
3. 큐티/기도/말씀 중 일부만 체크하고 저장한다.
4. 저장 후 홈 월간 요약과 캘린더 카드 이동을 확인한다.
5. 월간 캘린더에서 색상 단계가 체크 개수와 맞는지 확인한다.
6. 김도윤으로 로그인한다.
7. 관리자 > 경건에서 주간 현황/미제출자 목록을 확인한다.
8. 관리자 > 정산 > 청구에서 이하은의 벌금 청구가 생성 또는 반영되는 조건을 확인한다.
9. 이하은으로 로그인해 납부/청구 화면에서 금액과 계좌가 보이는지 확인한다.
10. QA 청구 1건에 한해 `납부 완료`를 실행해 `PATCH /api/v1/campuses/{campusId}/charges/me/{chargeItemId}/paid`를 확인한다.
11. 김도윤으로 관리자 > 정산 > 청구 상세에서 멤버별 청구 API와 관리자 상태 변경 API를 확인한다.

기대 결과:
- 경건 체크 저장 성공 후 홈/월간 캘린더가 갱신된다.
- 미제출자는 관리자 경건 현황에 보인다.
- 벌금 청구가 생성되는 시점이 백엔드 계약과 일치한다.
- 청구 금액은 벌금 규칙과 일치한다.

예외 확인:
- 이미 저장된 경건 체크 수정.
- 네트워크 실패 시 입력값 보존.
- 마감/잠김 주차에서 수정 버튼 비활성화.

기록:
- 체크한 항목:
- 생성된 청구 ID:
- 청구 금액:
- 납부 처리 결과:
- 관리자 청구 상태 변경 결과:
- 이슈:

## 세션 06. 일반 CUSTOM 투표 생성과 사용자 항목 추가

목표: 관리자 일반 투표 생성, 사용자 항목 추가 ON/OFF, 일반 사용자 응답을 검증한다.

사용 계정:
- 김도윤 MANAGER
- 이하은 일반 사용자
- 정민수 일반 사용자

투표 데이터:
- 제목: `청년부 가을 수련회 장소 선호도 {TS}`
- 설명: `10월 청년부 1박 2일 수련회 장소를 정하기 위한 사전 투표입니다.`
- 옵션:
  - `가평 숲속 수련원`
  - `강화도 바다 펜션`
  - `양평 기도원`
- 사용자 항목 추가: ON
- 마감: QA 당일 + 2일 23:00

절차:
1. 김도윤으로 관리자 > 투표 > 생성에 진입한다.
2. 일반 CUSTOM 투표를 만든다.
3. 생성 후 투표 > 진행 목록으로 이동하고 새 투표가 상단에 보이는지 확인한다.
4. 이하은으로 로그인해 투표 상세에 진입한다.
5. `항목 추가` 버튼이 보이는지 확인한다.
6. 항목 `제주도 청년수련관`을 추가한다.
7. 새 항목이 목록에 보이고 선택/응답 가능한지 확인한다.
8. 정민수로 로그인해 다른 옵션에 응답한다.
9. 이하은으로 투표 댓글을 작성한다.
10. 작성한 댓글을 수정한다.
11. QA 댓글 1개를 삭제한다.
12. 김도윤으로 관리자 > 투표 > 진행/결과에서 응답자와 결과를 확인한다.
13. 관리자 상세에서 미응답자 목록을 조회한다.
14. QA 투표에 한해 `투표 종료` 확인 모달을 열고 실제 종료한다.

기대 결과:
- 생성 payload에 `allowUserOptionAdd: true`가 반영된다.
- 일반 사용자 상세에서 항목 추가 버튼이 보인다.
- 중복 텍스트 항목은 `이미 추가된 항목입니다` 등으로 막힌다.
- 응답 후 결과/응답자 수가 관리자 화면에 반영된다.
- 댓글 생성/수정/삭제 후 댓글 목록이 갱신된다.
- 종료 후 status가 CLOSED로 바뀐다.

예외 확인:
- 사용자 항목 추가 OFF 투표를 하나 만들고 버튼이 숨겨지는지 확인.
- 빈 항목 저장 시 저장 불가.
- 마감/종료 투표에서 항목 추가 버튼 숨김.

기록:
- 투표 ID:
- 추가 항목 optionId:
- 댓글 ID:
- 미응답자 조회 결과:
- 종료 결과:
- 응답 결과:
- 이슈:

## 세션 07. 커피 담당자, 커피 계좌, 커피투표와 청구

목표: 커피 담당자 지정부터 커피투표 응답 후 청구 생성까지 확인한다.

사용 계정:
- 김도윤 MANAGER
- 이하은 일반 사용자
- 정민수 일반 사용자

절차:
1. 김도윤으로 관리자 > 멤버 > 커피담당에 진입한다.
2. 김도윤 또는 이하은을 커피 담당자로 지정한다.
3. 커피 담당자 계정으로 일반 사용자 > 내정보 또는 관리자 진입 경로에서 `커피 정산 관리`를 확인한다.
4. 커피 계좌를 등록한다.
   - 카카오뱅크 `3333-06-3026`
   - 예금주 김도윤
   - 닉네임 `카페 모임 정산 계좌`
5. 커피투표를 생성한다.
   - 제목: `주일 청년부 카페 주문 {TS}`
   - 설명: `예배 후 카페 모임 음료 주문을 받습니다.`
   - 계좌: `카페 모임 정산 계좌`
   - 메뉴: 아메리카노, 카페라떼, 바닐라라떼, 허브티
   - 사용자 항목 추가: ON 기본값 확인
   - 마감: QA 당일 + 1일 13:00
6. 생성 후 커피투표 관리 목록에서 새 투표가 보이는지 확인한다.
7. 이하은으로 로그인해 커피투표에 응답한다.
   - 선택: 카페라떼 3,500원
8. 정민수로 로그인해 응답한다.
   - 선택: 아메리카노 2,500원
9. 투표 종료 또는 마감 조건에 따라 커피 청구가 생성되는지 확인한다.
10. 이하은/정민수 납부 화면에서 커피 청구 금액과 계좌를 확인한다.
11. 커피 담당자 정산 관리 또는 관리자 정산에서 해당 청구를 확인한다.
12. QA 커피투표에 한해 종료 API를 실행해 종료 후 청구 생성/갱신 조건을 확인한다.

기대 결과:
- 커피 담당자에게만 커피 정산 관리가 보인다.
- 계좌 등록 권한 오류가 로그아웃으로 처리되지 않는다.
- 커피 메뉴 선택 모달은 스크롤 가능하고 이미 추가된 메뉴는 `추가됨`으로 비활성화된다.
- 커피투표 응답 후 청구 금액은 선택 메뉴 가격과 일치한다.
- 청구 계좌는 선택한 커피 계좌와 연결된다.

예외 확인:
- 같은 메뉴 중복 추가 방지.
- 커피 사용자 항목 추가는 메뉴명 기준 중복 방지.
- 계좌 없이 커피투표 생성 시 명확한 오류.
- 이미 종료된 커피투표 응답 불가.

기록:
- 커피 담당자 userId:
- 커피 계좌 ID:
- 커피투표 ID:
- 선택 메뉴/가격:
- 생성 청구 금액:
- 커피투표 종료 결과:
- 이슈:

## 세션 08. 반복투표 생성과 반복 생성 결과

목표: 반복투표 템플릿/스케줄 생성과 실제 투표 생성 흐름을 검증한다.

사용 계정:
- 김도윤 MANAGER

반복투표 데이터:
- 제목: `매주 소그룹 식사 인원 조사 {TS}`
- 설명: `주일 소그룹 식사 준비 인원을 매주 확인합니다.`
- 옵션:
  - `식사 참석`
  - `식사 불참`
  - `늦게 합류`
- 반복 주기: 매주
- 시작일: 다음 주 월요일 09:00
- 마감일: 해당 주 토요일 18:00
- 사용자 항목 추가: OFF

절차:
1. 관리자 > 투표 > 반복에 진입한다.
2. 새 반복투표 템플릿을 생성한다.
3. 스케줄/옵션/마감 validation을 확인한다.
4. 생성 후 반복 목록에 템플릿이 보이는지 확인한다.
5. 생성된 템플릿 상세를 열어 `GET /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`를 확인한다.
6. 템플릿 제목을 `매주 소그룹 식사 인원 조사 수정 {TS}`로 1회 수정해 PATCH를 확인한다.
7. 가능한 경우 반복투표 즉시 생성 또는 다음 실행 예정 정보를 확인한다.
8. 일반 사용자 화면 투표 목록에서 생성된 반복 투표가 보이면 응답한다.
9. 종료/정리 세션에서 QA 템플릿 1개를 삭제해 DELETE를 확인한다.

기대 결과:
- 반복투표 생성 UI와 일반 투표 생성 UI 흐름이 일관된다.
- 사용자 항목 추가 OFF면 일반 사용자 항목 추가 버튼이 없다.
- 반복 목록/상세에서 다음 실행 정보가 잘리지 않는다.

예외 확인:
- 시작일이 마감일보다 늦을 때 오류.
- 옵션 0개 또는 1개일 때 오류.
- 반복 주기 누락 시 오류.

기록:
- 반복 템플릿 ID:
- 템플릿 수정 결과:
- 생성된 pollId:
- 템플릿 삭제 결과:
- 이슈:

## 세션 09. 기도 운영 기간, 조 관리, 기도제목 입력

목표: 기도 운영 기간을 만들고 조를 구성한 뒤 사용자 기도제목 작성/조회 흐름을 검증한다.

사용 계정:
- 김도윤 MANAGER
- 이하은, 정민수, 최서연 일반 사용자

운영 기간 데이터:
- 이름: `2026 여름 청년부 기도 운영 기간 {TS}`
- 시작일: 오늘 날짜 자동 사용

절차:
1. 김도윤으로 관리자 > 경건 > 기도제목 > 운영 기간에 진입한다.
2. 활성 운영 기간이 없으면 새 운영 기간을 시작한다.
3. 활성 운영 기간이 있으면 새 시작 폼이 숨겨지고 `운영 종료`만 보이는지 확인한다.
4. 관리자 > 경건 > 기도제목 > 조 관리로 이동한다.
5. `조 생성`을 눌러 `믿음 1조`를 만든다.
6. 다음 단계에서 이하은, 정민수를 선택하고 저장한다.
7. 저장 후 조 리스트로 돌아오는지 확인한다.
8. `소망 2조`를 만들고 최서연을 배정한다.
9. 이미 믿음 1조에 들어간 이하은/정민수가 소망 2조 멤버 선택에서 disabled인지 확인한다.
10. 관리자 > 경건 > 기도제목 > 현황에서 조별 작성 현황을 확인한다.
11. 이하은으로 로그인한다.
12. 홈 > `기도제목 입력` 카드로 들어가 내 조가 먼저 보이는지 확인한다.
13. 이하은 기도제목을 작성하고 저장한다.
14. 홈 > `조별 기도제목` 카드로 들어가 다른 조도 조회 가능한지 확인한다.
15. 정민수, 최서연도 각각 기도제목을 작성한다.
16. 김도윤으로 현황을 다시 확인한다.
17. 관리자/직접 호출로 `PUT /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}/submissions`를 QA 데이터에 한해 실행한다.
18. `믿음 1조` 이름을 `믿음 1조 - 수정`으로 바꿔 조 수정 API를 확인한다.
19. 운영 종료 버튼으로 QA 운영 기간을 종료하고, 종료 후 새 운영 기간 시작 화면이 보이는지 확인한다.

기대 결과:
- 운영 기간 시작일은 오늘로 자동 지정된다.
- 운영 기간 중에는 새 운영 기간 시작 폼이 보이지 않는다.
- `운영 종료`는 확인 모달 후 close API를 실행한다.
- 조 생성/수정/멤버 저장 후 리스트로 복귀한다.
- 한 사용자는 한 활성 조에만 배정된다.
- 일반 사용자는 자기 조의 자기 기도제목만 수정 가능하고 다른 조는 조회만 가능하다.
- 홈의 `조별 기도제목`과 `기도제목 입력`은 서로 다른 진입 의도를 가진다.

예외 확인:
- 조 이름 빈 값.
- 멤버 0명으로 조 생성 시 오류 또는 명확한 빈 상태.
- 다른 조 배정 멤버를 강제로 선택하려 할 때 disabled 유지.
- 운영 종료 후 조/현황이 더 이상 활성 데이터로 보이지 않고 새 운영 기간 시작이 가능해진다.

기록:
- 운영 기간 ID:
- 조 ID:
- 각 사용자 기도제목 저장 결과:
- bulk submissions 저장 결과:
- 조 수정 결과:
- 운영 종료 결과:
- 이슈:

## 세션 10. 보강 API와 정리성 액션

목표: UI 흐름에서 빠지기 쉬운 API를 QA 데이터에 한해 직접 실행하고, 전체 API 커버리지 표를 채운다. 알림/FCM API는 제외한다.

사용 계정:
- 전역 ADMIN
- 김도윤 MANAGER

절차:
1. API 실행 매트릭스에서 빈 `실행 결과`를 확인한다.
2. UI에서 실행하지 못한 API는 QA 계정 token으로 직접 호출한다.
3. `PATCH /api/v1/campuses/{campusId}`로 캠퍼스 설명을 한 번 더 수정한다.
4. `POST /api/v1/admin/campuses/{campusId}/members`로 예비 QA 사용자를 추가한다.
5. 추가한 예비 QA 멤버를 `DELETE /api/v1/campuses/{campusId}/members/{membershipId}`로 제거한다.
6. QA 계좌 중 하나를 `PATCH /api/v1/admin/payment-accounts/{accountId}/deactivate`로 비활성화한다.
7. QA 청구 1건을 `PATCH /api/v1/admin/charges/{chargeItemId}/status`로 상태 변경한다.
8. QA 커피 담당 assignment를 `DELETE /api/v1/admin/campuses/{campusId}/duty-assignments/coffee/{assignmentId}`로 해제한다.
9. QA 반복투표 템플릿 1개를 `DELETE /api/v1/admin/campuses/{campusId}/poll-templates/{templateId}`로 삭제한다.
10. 모든 직접 호출 결과를 API 실행 매트릭스에 채운다.

기대 결과:
- 직접 호출한 API는 모두 2xx 또는 계약에 맞는 명확한 4xx를 반환한다.
- 삭제/비활성화는 QA 데이터에만 적용된다.
- UI로 다시 들어갔을 때 변경 결과가 반영된다.
- 알림/FCM API는 실행하지 않고 `제외`로 기록한다.

예외 확인:
- 권한이 부족한 계정으로 직접 호출하면 403/권한 오류가 나온다.
- 이미 삭제/비활성화된 리소스를 다시 호출하면 계약에 맞는 오류가 나온다.

기록:
- 직접 호출 API:
- status/body 요약:
- UI 반영 여부:
- 이슈:

## 세션 11. 권한별 화면 접근과 로그아웃

목표: USER/MANAGER/ADMIN 권한별 진입 가능 화면을 확인한다.

사용 계정:
- 전역 ADMIN
- 김도윤 MANAGER
- 이하은 USER

절차:
1. 이하은 USER로 로그인한다.
2. 관리자 버튼이 보이지 않는지 확인한다.
3. 이하은 내정보에서 로그아웃한다.
4. 김도윤 MANAGER로 로그인한다.
5. 일반 사용자 홈에서 `관리자` 버튼이 보이는지 확인한다.
6. 관리자 화면 오른쪽 위 `사용자` 버튼을 눌러 모달 없이 일반 사용자 홈으로 돌아가는지 확인한다.
7. 김도윤 내정보에서 로그아웃한다.
8. 전역 ADMIN으로 로그인한다.
9. Service ADMIN 진입이 가능한지 확인한다.
10. Service ADMIN > 내정보에서 로그아웃 버튼이 보이고 로그아웃 확인 모달이 뜨는지 확인한다.

기대 결과:
- USER는 일반 사용자 페이지만 접근.
- MANAGER는 일반 사용자 + 캠퍼스 관리자 접근.
- ADMIN은 일반 사용자 + 캠퍼스 관리자 + Service ADMIN 접근.
- 관리자/Service ADMIN 우측 메인 버튼 정책이 사용자 기대와 맞다.
- 로그아웃 후 토큰이 삭제되고 로그인 화면으로 이동한다.

예외 확인:
- 세션 만료 시 로그인 화면으로 이동.
- 권한 없는 API는 로그아웃이 아니라 권한 오류로 보인다.

기록:
- 권한별 접근 결과:
- 로그아웃 결과:
- 이슈:

## 세션 12. 전체 예외 상황 매트릭스

목표: 기능별 실패/경계 조건을 빠르게 훑는다.

| 영역 | 예외 | 기대 결과 |
| --- | --- | --- |
| 회원가입 | 이메일 중복 | inline 오류, 앱 상태 유지 |
| 로그인 | 잘못된 비밀번호 | inline 오류, 토큰 저장 안 됨 |
| 캠퍼스 참여 | 잘못된 초대코드 | 참여 실패 메시지 |
| 계좌 | 필수값 누락 | 저장 불가와 field/inline 오류 |
| 정산 | 권한 없는 사용자 접근 | 권한 오류, 로그아웃 금지 |
| 경건 체크 | 잠긴 주차 수정 | 수정 버튼 비활성화 |
| 투표 | 마감 후 응답 | 응답 버튼 숨김/비활성화 |
| 투표 | 항목 추가 OFF | 항목 추가 버튼 숨김 |
| 투표 | 중복 항목 추가 | 중복 안내 |
| 커피투표 | 계좌 없이 생성 | 계좌 선택 필요 안내 |
| 커피투표 | 중복 메뉴 추가 | `추가됨` 표시와 비활성화 |
| 기도조 | 다른 조 배정 멤버 선택 | disabled와 `{조이름}에 배정됨` 표시 |
| 기도 운영 기간 | 활성 기간 중 새 기간 시작 | 시작 폼 숨김, 운영 종료만 표시 |
| 네트워크 | 요청 실패 | inline 오류, 입력값 보존 |
| API 직접 호출 | 권한 부족 | 계약에 맞는 401/403, 앱 세션 오염 없음 |

기록:
- 통과:
- 실패:
- 재현 경로:

## 세션 13. 종료/정리 보고

목표: QA에서 만든 데이터와 남은 이슈를 PM/개발 세션에 넘긴다.

보고 형식:

```md
## QA 종료 보고

- 실행 일시:
- 앱 환경:
- 캠퍼스:
- 생성 계정:
- 생성 계좌:
- 생성 투표:
- 생성 반복투표:
- 생성 커피투표:
- 생성 기도 운영 기간/조:
- 생성 청구:
- 실행한 종료/삭제/비활성화:
- 통과한 세션:
- 실패한 세션:
- blocker:
- 백엔드 의존성:
- 프론트 수정 필요:
- 스크린샷/로그 위치:
```

최종 완료 기준:
- 신규 매니저 생성/승급/캠퍼스 생성이 처음부터 성공.
- 일반 사용자 3명이 초대코드로 참여.
- 계좌/벌금 규칙/경건 체크/청구가 연결.
- 일반 투표/커피투표/반복투표가 생성, 응답, 결과 확인 가능.
- 커피투표 청구 금액과 계좌가 메뉴/계좌 선택과 일치.
- 기도 운영 기간/조/기도제목 작성/조회/종료 흐름이 동작.
- 권한별 화면 접근과 로그아웃이 기대와 일치.
- 알림/FCM 제외 나머지 API 실행 매트릭스의 실행 결과가 모두 기록됨.
