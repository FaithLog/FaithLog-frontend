# 2026-06-30 FaithLog 실제 앱 QA 보고서

기준 문서: `docs/qa/full-app-regression-scenarios.md`

환경:
- 앱: iPhone 17 Simulator, iOS 26.5
- Expo/Metro: `localhost:8102`
- API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 계정: 전역 ADMIN `josephuk77@naver.com`, 비밀번호 원문은 기록하지 않음
- 제외 범위: 알림/FCM

## 요약

결과: PARTIAL

실제 앱에서 전역 ADMIN 로그인, Service ADMIN 사용자 조회, 관리자 하단바/멤버/경건/기도/투표 생성, 사용자 홈 카드와 조별 기도제목 진입을 확인했다. 신규 계정 생성부터 새 캠퍼스 생성까지의 전체 초기화 시나리오는 이번 패스에서 끝까지 진행하지 못했다.

생성한 QA 데이터:
- CUSTOM 투표: `QA custom poll 20260630205703`
- 설정: `사용자 항목추가 가능` ON
- 결과: 관리자 투표 생성 성공 후 `투표 > 진행` 목록으로 자동 이동, 생성한 투표가 목록에 표시됨

## 검증 명령

| 항목 | 결과 | 메모 |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` 성공 |
| `npm run test` | PASS | 11 files, 67 tests passed |
| `git diff --check` | PASS | whitespace 오류 없음 |
| `npm run lint` | BLOCKED | 2분 이상 출력 없이 계속 실행되어 QA 중단, exit 130 |

## 확인한 정상 동작

### 로그인과 사용자 홈

- 전역 ADMIN 계정으로 로그인 성공.
- 사용자 홈 상단에는 캠퍼스명, 사용자명, 관리자 진입 버튼이 보임.
- 사용자 홈 카드 구성:
  - 캘린더
  - 조별 기도제목
  - 기도제목 입력
  - 최근 청구 항목
- 조별 기도제목 페이지에도 하단바는 실제 화면에서 표시됨.

### Service ADMIN

- 사용자 홈의 `관리자` 버튼을 누르면 전역 ADMIN에게만 관리자/Service ADMIN 선택 모달이 표시됨.
- Service ADMIN 진입 성공.
- Service ADMIN 우측 `사용자` 버튼은 모달 없이 사용자 홈으로 복귀함.
- Service ADMIN 사용자 조회:
  - `전체 / 일반 / 관리자 / 전역` 필터가 한 줄로 표시됨.
  - `총 38명 · 1/4 페이지`, `10개씩` 표시 확인.
  - `다음` 클릭 시 2/4 페이지로 이동 확인.
  - `일반` 필터 클릭 시 1/4 페이지로 초기화 확인.

### 캠퍼스 관리자

- 관리자 홈 진입 성공.
- 하단바 5개 탭이 표시됨:
  - 홈
  - 멤버
  - 경건
  - 투표
  - 정산
- 관리자 우측 `사용자` 버튼으로 사용자 홈 복귀 가능.
- 멤버 탭:
  - 초대코드 복사 row 표시.
  - `멤버 / 역할 / 커피담당` 하위 세그먼트 표시.
  - 커피담당 탭에서 현재 담당자와 지정 UI 표시.
- 경건 탭:
  - `경건 현황 / 기도제목` 분리 확인.
  - 기도제목 안에서 `현황 / 조 관리 / 운영 기간` 분리 확인.
- 운영 기간:
  - 진행 중 운영 기간 감지.
  - 시작일 선택 UI 없음.
  - `운영 종료` 버튼이 있음.
  - 버튼 클릭 시 확인 sheet 표시.
  - 실제 종료 실행은 누르지 않음.
- 투표 탭:
  - `진행 / 마감 / 생성 / 반복` 세그먼트 표시.
  - CUSTOM 생성 폼에 `사용자 항목추가 가능` 스위치 표시.
  - 스위치 ON 후 투표 생성 성공.
  - 생성 후 `진행` 목록으로 이동하고 생성 투표가 보임.

## 발견 이슈

### QA-001. 조별 기도제목 조 row를 눌러도 상세 화면으로 이동하지 않음

심각도: HIGH

재현:
1. 사용자 홈으로 이동.
2. `조별 기도제목` 카드 클릭.
3. `PERF_20260624_CLOUDRUN_A Prayer Group 1` row 클릭.
4. 화면이 바뀌지 않고 같은 목록 화면에 머무름.
5. `기도제목 입력` 카드로 들어가 같은 조 row를 눌러도 동일함.

기대:
- 조 row를 누르면 해당 조의 기도제목 상세로 들어가야 함.
- 다른 조도 볼 수 있고, 내 조는 수정/입력 권한을 분리해서 보여야 함.

실제:
- row는 버튼으로 노출되지만 탭 후 화면 전환이 없음.

영향:
- 사용자가 조별 기도제목을 “들어가서 보는” 핵심 흐름을 사용할 수 없음.

증거:
- 스크린샷: `/var/folders/gs/b8zs3kfn5j5cc52d5p1xt88r0000gn/T/screenshot_optimized_ba371e1c-011a-4d16-b961-32ee5c02587a.jpg`

### QA-002. 관리자 역할 화면에 내부 기술 문구가 노출됨

심각도: MEDIUM

재현:
1. 관리자 화면 진입.
2. `멤버 > 역할` 선택.
3. 설명 문구 확인.

실제 문구:
- `권한 위계 위반은 서버 403 UX로 분리합니다.`

문제:
- `서버 403 UX`는 사용자/운영자에게 노출될 문구가 아님.
- 운영툴 문맥에서는 `권한이 없는 변경은 저장되지 않습니다.` 정도로 바꾸는 편이 자연스러움.

### QA-003. 관리자/Service ADMIN 선택 모달 문구가 여전히 추상적임

심각도: LOW

재현:
1. 전역 ADMIN 사용자 홈에서 `관리자` 버튼 클릭.
2. 선택 모달 확인.

실제:
- 제목: `이동하기`
- 문구: `이동할 곳을 선택하세요`

문제:
- 사용자가 이전에 `이동/전환/화면` 계열 문구를 어색하다고 지적했음.
- ADMIN만 모달이 뜨는 조건은 맞지만, 문구는 `관리자 선택` 또는 `관리할 영역 선택`처럼 더 구체적인 표현이 낫다.

### QA-004. 긴 캠퍼스명에서 관리자 홈 카드 제목이 크게 줄바꿈됨

심각도: LOW

재현:
1. 관리자 홈 진입.
2. 캠퍼스명이 긴 캠퍼스 선택 상태 확인.

실제:
- 상단 pill은 말줄임 처리됨.
- 홈 요약 카드 안의 캠퍼스명은 큰 제목 크기로 2줄 이상 줄바꿈됨.

문제:
- iPhone 폭에서 관리자 홈 첫 화면의 정보 밀도가 흔들림.
- 카드 제목에는 캠퍼스명을 작게 두거나 한 줄 ellipsis를 적용하는 편이 안정적임.

### QA-005. 알림 기능이 아직 연결되지 않았는데 관리자/Service ADMIN 홈에 진입점이 남아 있음

심각도: LOW

재현:
1. 관리자 홈 또는 Service ADMIN 홈 진입.
2. `알림 관리` 또는 `알림 발송` 바로가기 확인.

문제:
- 이번 QA 범위에서 알림/FCM은 제외됨.
- 아직 연결되지 않은 기능이면 운영자가 누를 수 있는 진입점을 임시 숨김 또는 `준비 중` 상태로 분리하는 것이 혼란을 줄임.

### QA-006. 조별 기도제목 화면에 도메인과 맞지 않는 문구가 보임

심각도: MEDIUM

재현:
1. 사용자 홈에서 `조별 기도제목` 또는 `기도제목 입력` 카드 클릭.
2. 상단 설명 문구 확인.

실제 문구:
- `우리 어부와 선원들이 조별 기도제목을 한곳에서 확인해요`

문제:
- FaithLog 교회/캠퍼스 도메인과 맞지 않는 비유가 노출됨.
- 사용자는 실제 교회 공동체 운영 화면으로 인식해야 하는데, 갑자기 다른 세계관의 문구가 보여 신뢰감을 깎음.

추천:
- `조별 기도제목을 한곳에서 확인해요`
- `이번 주 기도제목을 조별로 확인해요`
- `내 조는 작성하고, 다른 조는 함께 볼 수 있어요`

### QA-007. computer-use 접근성 세션이 Simulator 메뉴바를 잘못 잡음

심각도: QA LIMITATION

상황:
- 사용자 요청에 따라 computer-use로 Simulator를 조작했다.
- 중간부터 computer-use가 앱 화면 대신 macOS `Edit` 메뉴 접근성 트리를 반환했다.
- 이후 일부 좌표 클릭은 실제 시뮬레이터에 적용됐지만, 접근성 출력은 `cgWindowNotFound`, `noWindowsAvailable` 등으로 불안정했다.

영향:
- 후반부 QA는 Xcode simulator runtime snapshot과 screenshot으로 보조 확인했다.
- 앱 자체 버그라기보다 QA 자동화 도구 제한으로 분리한다.

## 미완료 시나리오

아래 항목은 이번 실제 앱 패스에서 끝까지 수행하지 못했다.

- 신규 일반/매니저 계정 생성.
- 전역 ADMIN으로 신규 계정 MANAGER 승급.
- 신규 매니저로 새 캠퍼스 생성.
- 새 캠퍼스 계좌 등록, 벌금 규칙 생성.
- 일반 사용자 신규 가입 후 초대코드 참여.
- 경건 체크 저장과 벌금 청구 생성.
- 커피 담당자 지정, 커피 계좌 등록, 커피투표 생성/응답/청구 생성.
- 반복투표 생성/수정/삭제.
- 기도 운영 기간 종료 실제 실행.
- 조 생성/수정/멤버 배정 실제 저장.

## 다음 QA 우선순위

1. `QA-001` 조별 기도제목 row 상세 진입 수정/확인.
2. 신규 계정/신규 캠퍼스 기반 전체 시나리오 재시작.
3. CUSTOM 투표 `QA custom poll 20260630205703`를 사용자 투표 상세에서 열고 항목 추가 저장까지 확인.
4. lint가 왜 2분 이상 무응답인지 별도 확인.
5. 알림/FCM 미연결 상태에서 알림 진입점을 숨길지 PM 결정.

## QA 중 남긴 데이터

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 투표 | `QA custom poll 20260630205703` | CUSTOM, 사용자 항목추가 가능 ON |

민감정보:
- 전역 ADMIN 비밀번호는 입력에만 사용했고 문서에는 기록하지 않음.

## 2026-06-30 버그 수정 반영

수정 파일:
- `src/prayers/PrayerScreen.tsx`
- `src/admin/AdminScreen.tsx`
- `src/admin/ServiceAdminScreen.tsx`
- `src/root/FaithLogApp.tsx`

반영 내용:
- `QA-001`: 조별 기도제목 목록에서 조 row를 누르면 상세 패널로 들어가도록 목록/상세 상태를 분리했다. 상세에는 `목록` 버튼을 추가해 다시 조 목록으로 돌아갈 수 있게 했다.
- `QA-002`: 관리자 역할 화면의 내부 기술 문구를 운영자용 문구로 교체했다.
- `QA-003`: 전역 ADMIN 관리자 영역 선택 sheet 문구를 `관리자 선택`, `관리할 영역을 선택하세요`로 바꿔 의미를 명확히 했다.
- `QA-004`: 관리자 홈 요약 카드의 긴 캠퍼스명을 한 줄 ellipsis로 정리했다.
- `QA-005`: 알림/FCM 미연결 상태에서 관리자 홈과 Service ADMIN 홈의 알림 바로가기를 숨겼다. 기존 알림 화면/발송 기능 코드는 삭제하지 않았다.
- `QA-006`: 조별 기도제목 화면의 도메인과 맞지 않는 문구를 `이번 주 기도제목을 조별로 확인해요`로 교체했다.

수정 후 검증:

| 항목 | 결과 | 메모 |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` 성공 |
| `npm run test` | PASS | 11 files, 67 tests passed |
| `git diff --check` | PASS | whitespace 오류 없음 |
| `npm run lint` | BLOCKED | 전체 lint와 수정 파일 단위 lint 모두 1~2분 이상 출력 없이 계속 실행되어 중단, exit 130 |
| iPhone 17 Simulator | PASS | 조별 기도제목 row 선택 후 `test 기도제목` 상세 패널과 멤버별 기도제목 카드 표시 확인 |

## 2026-06-30 Computer Use 재검증 및 다음 QA 진행

환경:
- iPhone 17 Simulator
- Expo/Metro: `localhost:8102`
- 계정: 전역 ADMIN `josephuk77@naver.com`, 비밀번호 원문은 기록하지 않음
- 방식: computer-use로 실제 버튼 클릭/입력/저장 확인

기존 오류 재검증:

| 항목 | 결과 | 확인 내용 |
| --- | --- | --- |
| `QA-001` 조별 기도제목 row 상세 진입 | PASS | 사용자 홈 > 조별 기도제목 > `test` 조 row 클릭 시 `test 기도제목` 상세 패널로 진입. `목록`, `수정`, 멤버별 기도제목 카드 표시 확인 |
| 조별 기도제목 작성률 | PASS | 상세 화면 상단에 `전체 작성 2/31`, `우리 조 작성 2/11` 분리 표시 확인. 홈 카드도 `전체 2/31 · 우리 조 2/11`로 표시 |
| `QA-002` 역할 화면 내부 기술 문구 | PASS | 관리자 > 멤버 > 역할에서 `권한이 없는 변경은 저장되지 않습니다.` 문구 확인 |
| 역할 목록 즉시 변경 버튼 제거 | PASS | 관리자 > 멤버 > 역할 목록에서 역할 변경 버튼이 사라지고 `상세` 진입만 남음. 상세 화면 안에서만 역할 변경 버튼 표시 |
| `QA-003` 관리자 선택 모달 문구 | PASS | 전역 ADMIN 사용자 화면의 관리자 선택 sheet가 `관리자 선택`, `관리할 영역을 선택하세요`로 표시 |
| `QA-004` 긴 캠퍼스명 | PASS | 관리자 홈 카드의 긴 캠퍼스명이 한 줄 ellipsis로 표시 |
| 정산 미납 0원 노출 방어 | PASS | 관리자 > 정산 > 청구에서 `미납 + 벌금` 필터 시 0원 행 없이 금액 있는 회원만 표시. 상세에서도 1,800원 청구만 표시 |

다음 QA 진행:

| 항목 | 결과 | 확인 내용 |
| --- | --- | --- |
| CUSTOM 투표 생성 | PASS | 관리자 > 투표 > 생성에서 `사용자 항목추가 가능` ON으로 QA 투표 생성. 생성 후 `투표 > 진행` 목록으로 자동 이동 |
| 사용자 투표 목록 | PASS | 사용자 > 투표 > 진행 중인 투표에 생성한 QA 투표 표시 |
| 사용자 항목 추가 버튼 | PASS | 투표 상세 응답 탭에 `항목 추가` 버튼 표시 |
| 텍스트 항목 추가 sheet | PASS | 버튼 클릭 시 텍스트 입력 bottom sheet 표시. 빈 값에서는 추가 버튼 disabled |
| 텍스트 항목 추가 저장 | PASS | `QA 추가 항목 2304` 입력 후 추가 성공. 새 선택지가 목록에 추가되고 선택 상태로 반영 |
| 응답 제출 | PASS | 추가한 항목으로 응답 제출 후 결과 탭 전환. `내 응답은 QA 추가 항목 2304으로 저장됐어요.` 표시 |

추가 생성 QA 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| CUSTOM 투표 | `QA 사용자 항목 추가 투표 202606302303` | 사용자 항목추가 가능 ON |
| 사용자 추가 선택지 | `QA 추가 항목 2304` | 위 투표에서 일반 사용자 flow로 추가 |
| 투표 응답 | `QA 추가 항목 2304` | 전역 ADMIN 사용자 화면에서 응답 제출 |

## 2026-07-01 기도 운영 기간/조 관리 QA

환경:
- iPhone 17 Simulator
- Expo/Metro: `localhost:8102`
- 계정: 전역 ADMIN `josephuk77@naver.com`, 비밀번호 원문은 기록하지 않음
- 캠퍼스: `PERF_20260624_CLOUDRUN_A Campus`
- 방식: computer-use로 실제 관리자 화면 클릭/입력/저장 확인

확인 결과:

| 항목 | 결과 | 확인 내용 |
| --- | --- | --- |
| 운영 기간 화면 | PASS | 관리자 > 경건 > 기도제목 > 운영 기간에서 활성 운영 기간 `PERF_20260624_CLOUDRUN_A Prayer Season` 표시. 새 기간 시작 폼은 숨겨지고 `운영 종료` 버튼만 노출 |
| 운영 종료 확인 | PASS | `운영 종료` 클릭 시 확인 bottom sheet 표시. 실제 종료 실행은 하지 않고 취소 |
| 조 관리 기본 화면 | PASS | 기본 화면이 조 리스트로 열리고 활성 기도조 3개가 표시됨 |
| 조 생성 1단계 | PASS | 조 생성 화면에서 조 이름만 입력. 정렬 순서/내부 ID 입력 없음 |
| 다른 조 멤버 선택 방지 | PASS | 새 조 멤버 선택에서 기존 조 소속 멤버는 disabled, `{조이름}에 배정됨` 표시 |
| 조 생성 후 리스트 복귀 | PASS | `QA 믿음조 202607010045` 생성 후 조 리스트로 복귀하고 `조원 1명`으로 표시 |
| 조 수정 후 리스트 복귀 | PASS | QA 조 이름을 `QA 믿음조 수정 202607010045`로 수정 후 리스트로 복귀하고 변경명 표시 |
| 현재 조 멤버 선택 유지 | PASS | QA 조 수정 화면에서 현재 조원 `test2`는 checked 상태로 선택 가능, 다른 조 멤버는 disabled 유지 |
| 빈 조 저장 방지 | FIXED/PASS | 모든 멤버가 배정된 상태에서 새 조 생성 시 `0명 선택`, `조원 1명 이상을 선택해야 저장할 수 있어요.` 표시, 저장 버튼 disabled |

발견/수정:
- 조 생성 멤버 선택 단계에서 선택 가능한 멤버가 없고 `0명 선택`이어도 저장 버튼이 활성화되는 UX 버그를 발견했다.
- `src/admin/AdminScreen.tsx`에서 멤버 0명 저장 버튼을 비활성화하고, 저장 함수에서도 `userIds`가 비면 API 호출 전 거절하도록 방어했다.

추가 생성 QA 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 기도조 | `QA 믿음조 202607010045` | 생성 후 이름 수정됨 |
| 기도조 | `QA 믿음조 수정 202607010045` | 최종 이름, 조원 `test2` 1명 |

보류/주의:
- 운영 종료는 DB에 endDate가 들어가는 실제 종료 액션이라 이번 QA에서는 확인 sheet까지만 검증했다.

수정 후 검증:

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |

## 2026-07-01 커피 담당자/커피투표/청구 QA

환경:
- iPhone 17 Simulator + XcodeBuildMCP + 배포 API 직접 호출
- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 대상 캠퍼스: campusId `4`, `새빛교회 청년부 판교캠퍼스 20260630214627`
- 관리자/커피담당자: `faithlog.qa.manager.20260630214627@example.com`
- 일반 사용자: `faithlog.qa.haeun.20260630214627@example.com`

확인 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 관리자 커피담당 화면 | PASS | 관리자 > 멤버 > 커피담당에서 담당자 없음 상태와 4명 후보 표시 확인 |
| 커피 담당자 지정 | PASS | 김도윤을 커피 담당자로 지정. 화면에 `김도윤 · 활성 담당자` 반영 |
| 내정보 커피 메뉴 | PASS | 김도윤 사용자 화면 > 내정보에 `커피 정산 관리` 노출 |
| 커피 정산 관리 진입 | PASS | 커피 담당자 화면이 `정산 / 계좌 / 투표 생성 / 투표 관리`로 분리되어 표시 |
| 커피 계좌 등록 API | PASS | `POST /api/v1/admin/campuses/4/payment-accounts`로 COFFEE 계좌 id `11` 생성 |
| 커피 계좌 UI 반영 | PASS | 커피 정산 관리 > 계좌에 `Coffee QA Account 202607011010`, `KakaoBank 3333-06-1010`, `예금주 Kim Doyun` 표시 |
| 커피 메뉴 조회 | PASS | `GET /api/v1/coffee-brands`, `GET /api/v1/coffee-brands/{brandId}/menus`로 메뉴 조회 |
| 커피투표 생성 API | PASS | `POST /api/v1/admin/campuses/4/polls`로 pollId `23`, `allowUserOptionAdd: true`, paymentAccountId `11` 생성 |
| 일반 사용자 응답 API | PASS | 이하은이 optionId `55` 에스프레소로 응답 저장. responseId `28` |
| 커피투표 종료 API | PASS | `PATCH /api/v1/admin/campuses/4/polls/23/close` 후 status `CLOSED` |
| 청구 생성 | PASS | 이하은 내 청구 API에 coffee charge id `18`, amount `1,500원`, account id `11` 생성 |
| 커피 담당자 정산 UI | PASS | 커피 정산 관리 요약에 `1,500원`, `미납 1명 · 커피 계좌 1개 · 담당자 김도윤` 표시 |
| 커피투표 관리 UI | PASS | 투표 관리 > 마감 탭에 `QA Coffee Poll 202607011010` 표시 |
| 커피투표 결과 UI | PASS | 결과 패널에 `응답 1명 · 미응답 3명`, `에스프레소 1명`, 응답자 `이하은` 표시 |
| 관리자 정산 API | PASS | `GET /api/v1/admin/campuses/4/charges?paymentCategory=COFFEE&status=UNPAID`에 이하은 unpaidAmount `1,500원` 표시 |

생성/변경 테스트 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 커피 담당자 | 김도윤 | campusId `4`, 활성 담당자 |
| 커피 계좌 | id `11` | `Coffee QA Account 202607011010`, `COFFEE`, `KakaoBank`, `3333-06-1010`, `Kim Doyun` |
| 커피투표 | pollId `23` | `QA Coffee Poll 202607011010`, status `CLOSED`, allowUserOptionAdd `true` |
| 선택 메뉴 | 에스프레소 | menuId `1`, menuCode `ESPRESSO`, price `1,500원` |
| 응답 | responseId `28` | 이하은 -> optionId `55` |
| 커피 청구 | charge item id `18` | 이하은, `1,500원`, `UNPAID`, paymentAccountId `11` |

도구/환경 메모:
- Simulator 입력기가 한글 자판 상태라 XcodeBuildMCP `type_text`가 ASCII도 한글 자모로 입력했다. 그래서 커피 계좌/투표 생성은 UI 입력 대신 배포 API로 실행했다.
- UI로는 담당자 지정, 커피 정산 관리 진입, 계좌 반영, 정산 요약, 투표 관리/결과 반영을 확인했다.
- 일반 사용자 이하은의 납부 화면 UI는 계정 전환 입력 자동화 한계 때문에 직접 클릭 확인 대신 `GET /api/v1/campuses/4/charges/me?paymentCategory=COFFEE&status=UNPAID`로 확인했다.
| `npm run test` | PASS, 11 files / 67 tests |
| `git diff --check` | PASS |

## 2026-07-01 일반 CUSTOM 투표와 사용자 항목 추가 QA

환경:
- iPhone 17 Simulator + computer-use/XcodeBuildMCP
- 대상 캠퍼스: campusId `4`, `새빛교회 청년부 판교캠퍼스 20260630214627`
- 관리자/매니저: `faithlog.qa.manager.20260630214627@example.com`
- 일반 사용자: `faithlog.qa.haeun.20260630214627@example.com`

생성한 QA 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| CUSTOM 투표 | `청년부 가을 수련회 장소 선호도 202607010900` | 사용자 항목추가 가능 ON |
| 기본 선택지 | `가평 숲속 수련원`, `강화도 바다 펜션`, `양평 기도원` | 관리자 생성 UI에서 입력 |
| 사용자 추가 항목 | `제주도 청년수련관` | 이하은 계정에서 추가 후 자동 선택 |
| 사용자 응답 | 이하은 -> `제주도 청년수련관` | 결과 탭에 `4명 중 1명 응답`, 해당 선택지 `1명` 표시 |
| 댓글 | `QA comment updated: Jeju retreat center keeps travel and worship space balanced.` | 생성 후 수정 확인 |

확인 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 관리자 투표 생성 | PASS | 관리자 > 투표 > 생성에서 CUSTOM 투표 생성. 생성 후 `진행` 목록으로 자동 이동 |
| `allowUserOptionAdd` UI | PASS | 생성 폼에서 `사용자 항목추가 가능` 스위치 ON 확인 |
| 일반 사용자 목록 반영 | PASS | 이하은 로그인 후 투표 탭에 새 CUSTOM 투표 표시 |
| 항목 추가 버튼 | PASS | 투표 상세 응답 탭에 `항목 추가` 버튼 표시 |
| 텍스트 항목 추가 | PASS | `제주도 청년수련관` 추가 후 선택지 목록에 표시되고 자동 선택됨 |
| 응답 저장 | PASS | 응답 저장 후 결과 탭으로 이동, 내 응답 문구와 선택지별 명단 반영 |
| 댓글 생성 | PASS | 댓글 등록 후 댓글 카드 표시 |
| 댓글 수정 | PASS | `수정` 진입, 수정 저장 후 댓글 내용과 시간이 갱신됨 |

발견/수정:
- 투표 상세 카드의 `목록` 버튼이 긴 제목을 가리는 문제를 발견했다.
  - 수정: `src/polls/PollScreen.tsx`에서 제목/목록 버튼을 absolute 배치 대신 flex row로 정리했다.
- 실제 휴대폰 키보드가 올라올 때 댓글 입력창과 항목 추가 시트가 가릴 수 있는 구조였다.
  - 수정: 투표 목록/상세 화면과 사용자 항목 추가 bottom sheet에 `KeyboardAvoidingView` + `ScrollView keyboardShouldPersistTaps="handled"` + 하단 여백을 추가했다.
- 댓글 관련 버튼이 카드 안에서 과하게 커 보였다.
  - 수정: 댓글 등록/수정/삭제를 컴팩트 액션 버튼으로 정리했다.
- 공통 `Button`도 전반적으로 높이/패딩이 큰 편이었다.
  - 수정: `src/components/ui.tsx` 공통 버튼의 높이와 패딩을 줄이고, 버튼 텍스트는 한 줄 ellipsis 처리로 통일했다.

제한/메모:
- 한글 댓글 직접 입력은 Simulator 자동화 계층에서 글자가 깨져 ASCII QA 댓글로 대체했다. 앱 UI 입력 필드 자체는 settable로 정상 동작했다.
- pollId는 토큰 노출 위험 때문에 터미널 로그인 API 출력 방식으로 확인하지 않았다. UI 생성/상세/응답/결과 반영으로 기능 동작을 검증했다.

수정 후 검증:

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS, 11 files / 67 tests |
| `git diff --check` | PASS |

## 2026-07-01 보강 API와 정리성 액션 QA

환경:
- 배포 API 직접 호출: `https://faithlog-549871256004.asia-northeast3.run.app`
- 대상 캠퍼스: campusId `4`, `새빛교회 청년부 판교캠퍼스 20260630214627`
- 관리자/매니저: `faithlog.qa.manager.20260630214627@example.com`
- 전역 ADMIN 계정은 로그인에만 사용. 비밀번호는 기록하지 않음.

확인 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 캠퍼스 설명 수정 | PASS | `PATCH /api/v1/campuses/4` 200. 설명을 `QA 통합 회귀 테스트 캠퍼스 - 정리 API 확인 20260701015816`로 변경 |
| 예비 사용자 가입 | PASS | `faithlog.qa.reserve.20260701015816@example.com` 생성, userId `44` |
| Service ADMIN 멤버 직접 추가 | PASS | `POST /api/v1/admin/campuses/4/members` 201. membershipId `41`, `MEMBER + ACTIVE` |
| 예비 멤버 제거 | PASS | `DELETE /api/v1/campuses/4/members/41` 204 |
| 계좌 목록 조회 | PASS | `GET /api/v1/campuses/4/payment-accounts` 200. active 계좌 id `10`, `11` 확인 |
| 임시 계좌 생성 | BLOCKED | docs payload 그대로 `POST /api/v1/admin/campuses/4/payment-accounts` 호출했지만 매니저/전역 ADMIN 토큰 모두 401 `AUTH_UNAUTHORIZED`, `인증이 필요합니다.` 반환 |
| 청구 상태 변경 | PASS | `PATCH /api/v1/admin/charges/18/status`로 `WAIVED` 변경 200 |
| 청구 상태 복구 | PASS | 같은 charge item id `18`을 `UNPAID`로 복구 200. 금액 `1,500원` 유지 |
| 커피 담당 조회 | PASS | `GET /api/v1/admin/campuses/4/duty-assignments` 200. 김도윤 assignmentId `4`, dutyType `COFFEE`, active 확인 |
| 커피 담당 해제 | PASS | `DELETE /api/v1/admin/campuses/4/duty-assignments/coffee/4` 204 |
| 커피 담당 복구 | PASS | `PUT /api/v1/admin/campuses/4/duty-assignments/coffee`로 김도윤 userId `40` 재지정 200. 새 assignmentId `5` |
| 삭제용 반복 템플릿 생성 | PASS | `POST /api/v1/admin/campuses/4/poll-templates`로 template id `10`, `QA 삭제용 반복투표 20260701020015` 생성 |
| 삭제용 반복 템플릿 삭제 | PASS | `DELETE /api/v1/admin/campuses/4/poll-templates/10` 200. 응답 `isActive: false` |
| 일반 멤버 admin 멤버 목록 접근 | PASS | 이하은 토큰으로 `GET /api/v1/admin/campuses/4/members` 호출 시 403 `CAMPUS_MEMBER_MANAGE_FORBIDDEN` |
| 일반 멤버 청구 상태 변경 접근 | PASS | 이하은 토큰으로 `PATCH /api/v1/admin/charges/18/status` 호출 시 403 `BILLING_CHARGE_STATUS_MANAGE_FORBIDDEN` |

생성/변경 테스트 데이터:

| 구분 | 값 | 최종 상태 |
| --- | --- | --- |
| 예비 사용자 | `faithlog.qa.reserve.20260701015816@example.com`, userId `44` | 사용자 row는 남아 있고 캠퍼스 membershipId `41`은 제거됨 |
| 커피 담당 assignment | 기존 id `4` 해제 후 새 id `5` 생성 | 김도윤 userId `40`이 다시 active 커피 담당 |
| 커피 청구 | charge item id `18`, 에스프레소 `1,500원` | `WAIVED` 확인 후 `UNPAID`로 복구 |
| 삭제용 반복 템플릿 | template id `10` | `isActive: false` 삭제 처리 |

이슈/백엔드 의존성:
- `POST /api/v1/admin/campuses/4/payment-accounts`는 docs 기준 필드(`accountType`, `nickname`, `bankName`, `accountNumber`, `accountHolder`, `ownerUserId`)와 유효한 매니저/전역 ADMIN 토큰으로 호출했지만 모두 401을 반환했다.
- 같은 토큰으로 직전/직후 `GET /api/v1/campuses/4/payment-accounts`, 캠퍼스 수정, 멤버 추가/제거 등은 성공했으므로 토큰 자체 문제는 아니다.
- 백엔드 배포 API의 payment-account create endpoint 보안 매처 또는 인증 처리 확인이 필요하다.

## 2026-07-01 사용자 기도제목 입력/조회 QA

환경:
- iPhone 17 Simulator
- Expo/Metro: `localhost:8102`
- 계정: 전역 ADMIN `josephuk77@naver.com`, 비밀번호 원문은 기록하지 않음
- 캠퍼스: `PERF_20260624_CLOUDRUN_A Campus`
- 방식: computer-use로 실제 사용자 화면 클릭/입력/저장 확인

확인 결과:

| 항목 | 결과 | 확인 내용 |
| --- | --- | --- |
| 홈 기도 카드 배치 | PASS | 홈에서 `캘린더`, `조별 기도제목`, `기도제목 입력`, `최근 청구 항목` 카드가 같은 톤으로 표시됨 |
| 조별 기도제목 카드 요약 | PASS | `조별 기도제목` 카드에 `전체 2/32 · 우리 조 2/11` 표시 |
| 기도제목 입력 진입 | PASS | 홈 > `기도제목 입력` 클릭 시 내 조 `test` 상세가 바로 열림 |
| 입력 화면 하단바 | PASS | 기도제목 입력 상세에서도 사용자 하단바가 유지됨 |
| 입력 화면 진행률 | PASS | 상단에 `전체 작성 2/32`, `우리 조 작성 2/11` 분리 표시 |
| 보기/수정 분리 | PASS | 기본은 `test 모아보기` 보기 화면이고, `수정` 버튼을 눌러야 수정 화면으로 전환 |
| 같은 조 전체 입력 | PASS | 수정 화면에서 같은 조 11명 전체 입력란이 표시됨. 변경 전 저장 버튼 disabled |
| 기도제목 저장 | PASS | `관리자` 항목을 `QA 기도제목 저장 확인 202607010606`으로 수정 후 저장. 보기 화면에 저장 내용과 작성 시간이 반영됨 |
| 조별 기도제목 진입 | PASS | 홈 > `조별 기도제목` 클릭 시 조 목록 표시. 내 조에는 `내 조` 라벨 표시 |
| 다른 조 조회 | PASS | `PERF_20260624_CLOUDRUN_A Prayer Group 2` 선택 시 상세 조회 가능 |
| 다른 조 수정 제한 | PASS | 다른 조 상세에 `다른 조의 기도제목은 조회만 가능합니다.` 표시. 수정 버튼/입력란 없음 |

추가 변경 QA 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 기도제목 | `QA 기도제목 저장 확인 202607010606` | `test` 조의 `관리자` 항목 수정 |

이슈:
- 이번 사용자 기도제목 입력/조회 QA에서는 새 프론트 버그를 발견하지 못했다.

## 2026-07-01 권한별 화면 접근/로그아웃 QA

환경:
- iPhone 17 Simulator
- Expo/Metro: `localhost:8102`
- 방식: computer-use로 실제 로그인/버튼 클릭/로그아웃 확인
- 사용 계정: 전역 ADMIN `josephuk77@naver.com`, 캠퍼스 관리자/매니저 `test2@naver.com`, 일반 멤버 `test@naver.com`

확인 결과:

| 계정/권한 | 결과 | 확인 내용 |
| --- | --- | --- |
| 전역 ADMIN | PASS | 사용자 홈의 `관리자` 버튼 클릭 시 `관리자 선택` sheet가 뜨고 `관리자`, `Service ADMIN` 선택지가 표시됨 |
| 전역 ADMIN > Service ADMIN | PASS | Service ADMIN 화면 진입 후 하단바 `홈/캠퍼스/사용자/내정보` 표시. `내정보`에서 로그아웃 버튼과 확인 sheet 표시 |
| 전역 ADMIN > Service ADMIN 복귀 | PASS | Service ADMIN 상단 우측 `사용자` 버튼 클릭 시 별도 선택 모달 없이 사용자 홈으로 복귀 |
| 캠퍼스 관리자/매니저 | PASS | `test2@naver.com` 사용자 홈에 `관리자` 버튼 표시. 클릭 시 선택 모달 없이 캠퍼스 관리자 홈으로 바로 진입 |
| 캠퍼스 관리자/매니저 > 관리자 복귀 | PASS | 관리자 화면 상단 우측 버튼이 `일반 사용자로 이동`으로 노출되고 클릭 시 모달 없이 사용자 홈으로 복귀 |
| 캠퍼스 관리자/매니저 > 내정보 | PASS | 내정보에서 이메일 `test2@naver.com`, 역할 `교역자`로 표시. 로그아웃 확인 sheet 후 로그인 화면 복귀 |
| 일반 멤버 | PASS | `test@naver.com` 사용자 홈에는 `관리자` 진입 버튼이 없음 |
| 일반 멤버 > 내정보 | PASS | 내정보에서 이메일 `test@naver.com`, 역할 `일반 멤버`로 표시. 커피 담당자라 `커피 정산 관리`는 별도 권한 메뉴로 노출 |
| 일반 멤버 > 로그아웃 | PASS | 로그아웃 확인 sheet 후 로그인 화면 복귀 |

메모:
- `test@naver.com`은 캠퍼스 역할은 일반 멤버지만 커피 담당자 권한이 있어 내정보에 `커피 정산 관리`가 노출된다. 관리자 페이지 접근 권한과 커피 담당자 기능 권한은 분리되어 정상 동작했다.
- 이번 권한별 접근/로그아웃 QA에서는 추가 프론트 수정이 필요한 결함을 발견하지 못했다.

## 2026-07-01 전체 예외 상황 매트릭스 QA

환경:
- iPhone 17 Simulator
- Expo/Metro: `localhost:8102`
- 방식: computer-use + XcodeBuildMCP UI snapshot/screenshot 혼합

확인 결과:

| 영역 | 예외 | 결과 | 확인 내용 |
| --- | --- | --- | --- |
| 로그인 | 잘못된 비밀번호 | PASS | `test@naver.com`에 잘못된 비밀번호 입력 후 `이메일 또는 비밀번호를 다시 확인해 주세요.` inline 오류 표시. 로그인 화면 유지, 사용자 세션 전환 없음 |
| 회원가입 | 이메일 중복 | BLOCKED | 기존 이메일 `test@naver.com`으로 중복 가입 시도 중 iOS 암호 업데이트 시스템 팝업이 반복 노출되어 앱 서버 중복 오류까지 안정적으로 도달하지 못함. 신규 계정은 생성하지 않음 |
| 캠퍼스 참여 | 잘못된 초대코드 | NOT RUN | 일반 멤버 로그인까지 확인했으나, 시스템 팝업 이후 computer-use가 Simulator 창 핸들을 잃고 XcodeBuildMCP snapshot에는 하단 `내정보` 탭이 tap target으로 노출되지 않아 이번 라운드에서 보류 |
| 정산 | 권한 없는 사용자 접근 | PARTIAL/PASS | 세션 11에서 일반 멤버 `test@naver.com` 사용자 홈에 `관리자` 진입 버튼이 없음을 확인. 직접 API 401/403 호출은 이번 라운드 미실행 |
| 커피투표 | 중복 메뉴 추가 | PREVIOUS PASS | 이전 커피투표 생성 QA에서 이미 선택된 메뉴가 `추가됨`으로 표시되고 중복 추가가 비활성화됨을 확인 |
| 기도조 | 다른 조 배정 멤버 선택 | PREVIOUS PASS | 세션 09 보강 QA에서 다른 활성 조 소속 멤버 disabled 및 `{조이름}에 배정됨` 표시 확인 |
| 기도 운영 기간 | 활성 기간 중 새 기간 시작 | PREVIOUS PASS | 세션 09 보강 QA에서 활성 운영 기간이 있으면 새 기간 시작 폼이 숨겨지고 `운영 종료`만 표시됨을 확인 |

도구/환경 이슈:
- iOS 암호 업데이트/강력한 암호 시스템 팝업이 회원가입 폼 위에 반복 표시되어 중복 이메일 서버 오류 검증이 막혔다.
- 이후 computer-use가 Simulator window를 `cgWindowNotFound/noWindowsAvailable`로 인식하지 못했다. XcodeBuildMCP snapshot/screenshot은 동작했지만 하단 탭 일부가 tap target으로 노출되지 않아 나머지 예외 케이스는 다음 라운드에서 재시도 필요.

다음 라운드 권장:
- Simulator/Expo 세션을 재시작하거나 iOS 암호 자동완성 팝업을 끈 상태에서 세션 12의 미실행 항목부터 재개.
- 우선순위: 잘못된 초대코드, 계좌 필수값 누락, 투표 항목 추가 OFF/중복 항목, API 직접 권한 부족.

## 2026-07-01 신규 매니저/캠퍼스 생성 API QA

환경:
- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 기준 문서: `/Users/josephuk77/FaithLog/src/docs/asciidoc/index.adoc`
- 방식: Simulator 하단 탭 접근성 타겟 누락으로 UI 조작이 막혀, REST API 계약 기준으로 실제 데이터 생성/조회/수정 검증

문서 기준 확인:
- `POST /api/v1/campuses`는 `MANAGER` 또는 `ADMIN`만 가능하다.
- 캠퍼스 생성자는 생성된 캠퍼스의 `MINISTER + ACTIVE` 멤버십으로 등록된다.
- 캠퍼스 생성 요청은 `{ name, region, description }`이며 `penaltyAccount`는 받지 않는다.

실행 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 신규 매니저 후보 가입 | PASS | `faithlog.qa.manager.20260630214627@example.com` 생성. 가입 직후 전역 role `USER` |
| 전역 ADMIN 사용자 검색 | PASS | Service ADMIN 사용자 검색 API에서 신규 계정 조회 |
| MANAGER 승급 | PASS | `PATCH /api/v1/admin/users/{userId}/role`로 `MANAGER` 변경. 재로그인 후 role `MANAGER` 확인 |
| 캠퍼스 생성 | PASS | `POST /api/v1/campuses`로 campusId `4`, 초대코드 `FL-EB65BJBQ` 생성 |
| 생성자 캠퍼스 권한 | PASS | 생성 응답, 캠퍼스 상세, `/campuses/me` 모두 `MINISTER + ACTIVE` 확인 |
| 캠퍼스 수정 | PASS | `PATCH /api/v1/campuses/4`로 설명을 `QA 통합 회귀 테스트 캠퍼스 - 수정 확인`으로 변경 |
| 관리자 dashboard summary | PASS | `GET /api/v1/admin/campuses/4/dashboard/summary`가 MANAGER/생성자 토큰으로 200 성공 |
| 신규 일반 사용자 3명 참여 | PASS | 초대코드 `FL-EB65BJBQ`로 이하은/정민수/최서연이 `MEMBER + ACTIVE` 참여 |
| 관리자 멤버 목록 반영 | PASS | `GET /api/v1/admin/campuses/4/members`에 생성자 포함 4명 표시 |
| 잘못된 초대코드 | PASS | `FL-NOPE0000` 참여 시 404, code `CAMPUS_INVALID_INVITE_CODE`, message `유효하지 않은 초대코드입니다.` |
| 빈 캠퍼스 이름 | PASS | name blank 생성 시 400, code `GLOBAL_VALIDATION_FAILED`, message `name: must not be blank` |

생성/변경 테스트 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 매니저 계정 | `faithlog.qa.manager.20260630214627@example.com` | 최종 role `MANAGER`, QA 비밀번호 패턴 `Qa!20260630214627` |
| 캠퍼스 | `새빛교회 청년부 판교캠퍼스 20260630214627` | campusId `4`, region `판교` |
| 초대코드 | `FL-EB65BJBQ` | 신규 일반 사용자 참여에 사용 |
| 생성자 멤버십 | membershipId `37` | `MINISTER + ACTIVE` |
| 일반 사용자 | `faithlog.qa.haeun.20260630214627@example.com` | 이하은, membershipId `38`, `MEMBER + ACTIVE` |
| 일반 사용자 | `faithlog.qa.minsu.20260630214627@example.com` | 정민수, membershipId `39`, `MEMBER + ACTIVE` |
| 일반 사용자 | `faithlog.qa.seoyeon.20260630214627@example.com` | 최서연, membershipId `40`, `MEMBER + ACTIVE` |
| 고아 QA 계정 | `faithlog.qa.manager.20260630214516@example.com` | 첫 API 시도에서 admin 비밀번호 입력 실패 전에 생성됨. role `USER`, 캠퍼스 없음 |

남은 UI 확인:
- 실제 앱 UI에서 캠퍼스 생성 화면, 생성 후 홈 이동, 관리자 하단바/초대코드 복사 row는 아직 확인하지 못했다.
- 원인: computer-use가 Simulator window를 `cgWindowNotFound/noWindowsAvailable`로 인식했고, XcodeBuildMCP snapshot에는 하단 탭이 tap target으로 노출되지 않았다.
- 다음에는 Simulator/Expo 세션을 새로 열고 UI 경로를 재확인해야 한다.

QA 이후 구현 후보:
- 새 캠퍼스 생성 직후 관리자 홈에 작고 실용적인 `초기 설정` 체크리스트를 노출하면 좋다.
- 후보 항목: 초대코드 복사, 납부 계좌 등록, 벌금 규칙 설정, 멤버 초대, 기도 운영 기간 시작, 기도조 만들기, 필요 시 커피 담당자/커피 계좌 설정.
- 강제 온보딩/큰 안내 카드가 아니라 관리자 홈의 compact row 목록으로 두고, 완료된 항목은 숨기거나 `완료` 상태로 표시하는 방향이 적절하다.

## 2026-07-01 정산 기본 설정 API QA

환경:
- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 대상 캠퍼스: campusId `4`, `새빛교회 청년부 판교캠퍼스 20260630214627`
- 계정: `faithlog.qa.manager.20260630214627@example.com` (`MANAGER`, 캠퍼스 `MINISTER`)
- 방식: Simulator 하단 탭 접근성 이슈로 관리자 정산 UI 직접 클릭은 보류하고, REST API로 실제 계좌/규칙 생성과 조회/수정 검증

확인 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 정산 계좌 등록 | PASS | `POST /api/v1/admin/campuses/4/payment-accounts`로 계좌 id `10` 생성 |
| 계좌 목록 조회 | PASS | `GET /api/v1/campuses/4/payment-accounts`에 id `10`, `청년부 정산 계좌` 표시 |
| 벌금 규칙 생성 | PASS | `QUIET_TIME`, `PRAYER`, `BIBLE_READING`, `SATURDAY_LATE` 4개 규칙 생성 |
| 벌금 규칙 목록 조회 | PASS | `GET /api/v1/campuses/4/penalty-rules`에 규칙 id `9~12` 표시 |
| 벌금 규칙 수정 | PASS | `PATCH /api/v1/admin/penalty-rules/9`로 `QUIET_TIME.amountPerUnit`을 `1000 -> 1200` 수정 |
| 계좌 필수값 누락 | PASS | 빈 계좌 생성 시 400, code `GLOBAL_VALIDATION_FAILED`, message `accountHolder: 공백일 수 없습니다` |

생성/변경 테스트 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 납부 계좌 | id `10` | `PENALTY`, 토스뱅크 `1000-2026-0630`, 예금주 `김도윤`, nickname `청년부 정산 계좌`, active |
| 벌금 규칙 | id `9` | `QUIET_TIME`, `MISSING_COUNT`, requiredCount `1`, amountPerUnit 최종 `1200` |
| 벌금 규칙 | id `10` | `PRAYER`, `MISSING_COUNT`, requiredCount `1`, amountPerUnit `1000` |
| 벌금 규칙 | id `11` | `BIBLE_READING`, `MISSING_COUNT`, requiredCount `1`, amountPerUnit `1000` |
| 벌금 규칙 | id `12` | `SATURDAY_LATE`, `LATE_MINUTE`, requiredCount `0`, amountPerUnit `500` |

남은 UI 확인:
- 관리자 > 정산 > 계좌/규칙/청구 화면에서 계좌 row, 규칙 form, 필터/회원별 요약 UI가 모바일에서 겹치지 않는지 실제 클릭 확인 필요.
- 현재 Simulator 접근성 이슈 때문에 API 검증으로 대체했다.

## 2026-07-01 경건 체크와 벌금 청구 QA

환경:
- iPhone 17 Simulator + computer-use
- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 대상 캠퍼스: campusId `4`, `새빛교회 청년부 판교캠퍼스 20260630214627`
- 일반 사용자: `faithlog.qa.haeun.20260630214627@example.com`
- 관리자/매니저: `faithlog.qa.manager.20260630214627@example.com`

확인 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 일반 사용자 로그인 | PASS | 이하은 계정으로 로그인, 홈 헤더에 캠퍼스명만 축약 표시 |
| 경건 화면 진입 | PASS | 하단바 `경건` 탭으로 이동. 이번 주 `6월 29일 - 7월 5일` 표시 |
| 벌금 규칙 반영 | PASS | 초기 예상 벌금 `3,200원` 표시. 정산 QA에서 수정한 큐티 `1,200원` + 기도 `1,000원` + 말씀 `1,000원` 반영 |
| 일부 체크 | PASS | 7/1 수요일 `큐티`, `기도`만 체크. 예상 벌금 `1,000원`으로 변경 |
| 제출 확인 모달 | PASS | `제출 후에는 수정할 수 없어요`, 예상 벌금 `1,000원` 표시 |
| 주간 제출 | PASS | 제출 후 `제출 완료`, `입력 잠김`, 저장 시간 `2026.07.01 07:55` 표시 |
| 청구 생성 | PASS | 납부 화면에 `경건생활 벌금`, `2026-06-29 주간`, `1,000원`, `입금` 버튼 표시 |
| 계좌 연결 | PASS | 납부 계좌 `청년부 정산 계좌` 표시. API 기준 paymentAccountId `10`, 토스뱅크 `1000-2026-0630` 연결 |
| 납부 완료 처리 | PASS | `입금` 클릭 후 `납부 완료` 안내, 상단 총 미납 금액 `0원`, 납부 완료 필터에서 청구 표시 |
| 관리자 경건 미제출 | PASS | API 기준 미제출자 목록에 김도윤/정민수/최서연 3명 표시, 이하은은 제출자라 제외 |
| 관리자 정산 집계 | PASS | API 기준 캠퍼스 정산 summary `totalAmount 1000`, `paidAmount 1000`, `unpaidAmount 0` |
| 관리자 멤버 청구 상세 | PASS | 이하은 청구 item id `17`, amount `1000`, status `PAID`, paidAt 기록 확인 |

발견/수정:
- 납부 화면에서 청구 목록은 `1,000원`인데 상단 `총 미납 금액`이 `0원`으로 표시되는 불일치를 발견했다.
- 원인: 프론트가 상단 금액에 월간 summary API의 `monthlyUnpaidAmount`를 사용했다. 해당 청구는 `2026-06-29 주간`이라 현재 7월 기준 월간 summary에서는 `0원`이었다.
- 수정: `src/payments/PaymentScreen.tsx`에서 상단 총 미납 금액을 전체 미납 목록 summary(`GET /charges/me`의 `summary.unpaidAmount`) 기반으로 표시하도록 변경했다.
- 추가로 새로고침 버튼 접근성 라벨을 `미납 항목 납부 확인`에서 `납부 정보 새로고침`으로 수정했다.

생성/변경 테스트 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 경건 제출 | 이하은, 2026-06-29 주간 | 7/1 수요일 큐티/기도 체크, 말씀 미체크 |
| 벌금 청구 | charge item id `17` | `경건생활 벌금`, amount `1,000원`, source `DEVOTION_RECORD` id `17` |
| 납부 완료 | charge item id `17` | status `PAID`, paidAt `2026-06-30T23:01:41.556546Z` |

남은 UI 확인:
- 매니저 관리자 UI의 경건/정산 화면에서 이하은 제출/납부 결과가 실제 화면에도 같은지 추가 클릭 확인 가능.

수정 후 검증:

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS, 11 files / 67 tests |
| `git diff --check` | PASS |

## 2026-07-01 반복투표 생성과 반복 생성 결과 QA

환경:
- iPhone 17 Simulator + computer-use + 배포 API 직접 호출
- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 대상 캠퍼스: campusId `4`, `새빛교회 청년부 판교캠퍼스 20260630214627`
- 관리자/매니저: `faithlog.qa.manager.20260630214627@example.com`

확인 결과:

| 단계 | 결과 | 확인 내용 |
| --- | --- | --- |
| 반복투표 템플릿 생성 | PASS | `POST /api/v1/admin/campuses/4/poll-templates`로 template id `9` 생성 |
| 템플릿 상세 조회 | PASS | `GET /api/v1/admin/campuses/4/poll-templates/9`에서 제목/선택지/일정 조회 성공 |
| 템플릿 수정 | PASS | `PATCH /api/v1/admin/campuses/4/poll-templates/9`로 제목을 수정하고 목록에 반영 확인 |
| 사용자 항목 추가 OFF | PASS | 상세/목록 응답 모두 `allowUserOptionAdd: false` 확인 |
| 자동 생성 결과 | PASS | `GET /api/v1/campuses/4/polls`에 poll id `24`, status `OPEN`, 같은 제목의 반복 생성 투표 표시 |
| 관리자 진행 투표 UI | PASS | 관리자 > 투표 > 진행에 `매주 소그룹 식사 인원 조사 수정 202607011020` 카드 표시 |
| 관리자 반복 탭 UI | PASS after fix | 반복 탭이 저장 목록 없이 바로 작성 폼으로 열리던 문제 수정. 이제 목록 첫 화면에서 `활성 반복 1개`, `새 반복`, QA 템플릿 row 표시 |
| 반복 템플릿 편집 진입 | PASS | QA 템플릿 row 클릭 시 `반복투표 수정` 플로우로 이동하고 제목 값이 채워짐 |
| 새 반복 작성 진입 | PASS | `새 반복` 클릭 시 `반복투표 만들기` 플로우로 이동, `뒤로` 클릭 시 목록 복귀 |
| 기본 커피 템플릿 숨김 | PASS | 백엔드 기본 COFFEE 템플릿 id `8`, title `커피 주문 투표`, `isDefault: true`는 추천 row로 노출하지 않도록 숨김 처리. 반복 탭에는 QA custom 템플릿만 표시 |
| 반복 템플릿 삭제 확인 | PASS | QA 템플릿 row의 `삭제` 클릭 시 삭제 확인 카드가 열림. 실제 `DELETE` 실행은 QA 데이터 보존을 위해 취소 |

생성/변경 테스트 데이터:

| 구분 | 값 | 비고 |
| --- | --- | --- |
| 반복투표 템플릿 | template id `9` | 최종 제목 `매주 소그룹 식사 인원 조사 수정 202607011020` |
| 자동 생성 투표 | poll id `24` | status `OPEN`, `2026-06-29T00:00:00Z` 시작, `2026-07-04T09:00:00Z` 마감 |
| 선택지 | `식사 참석`, `식사 불참`, `늦게 합류` | 단일 선택 |
| 반복 일정 | 월 09:00 시작 · 토 18:00 마감 | `autoCreateEnabled: true` |

발견/수정:
- 발견: 관리자 > 투표 > 반복 탭이 저장된 반복투표 목록을 보여주지 않고 곧바로 새 반복투표 작성 화면으로 진입했다. 그래서 생성된 템플릿을 관리/편집하는 방법이 화면상 보이지 않았다.
- 수정: `src/admin/AdminScreen.tsx`에 반복투표 `list/editor` 모드를 분리했다. 반복 탭은 기본으로 목록을 보여주고, `새 반복` 또는 템플릿 row를 눌렀을 때만 작성/편집 플로우로 이동한다.
- 수정 후 확인: 시뮬레이터에서 목록, 편집 진입, 새 작성 진입, 뒤로 복귀까지 확인했다.

주의/UX 리스크:
- `커피 주문 투표`는 배포 API의 실제 backend default COFFEE 템플릿이다. 응답 기준 template id `8`, `isDefault: true`, `autoCreateEnabled: false`로 확인했고, 사용자 피드백에 따라 반복투표 목록에서는 숨겼다.
- 반복 템플릿 삭제 API는 UI 확인 카드까지 검증했다. 실제 삭제 실행은 QA 데이터 보존을 위해 이번 라운드에서 실행하지 않았다.

검증:

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS, 11 files / 67 tests |
| `git diff --check` | PASS |
