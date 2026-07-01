# 2026-07-01 백엔드 재배포 QA

## 범위

- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 계정: `test2@naver.com` 매니저, `test@naver.com` 일반 사용자
- iPhone 17 Simulator에서 로그인, 홈, 관리자 경건 화면 확인
- 알림 연동은 이번 QA 범위에서 제외

## 생성한 QA 데이터

- 캠퍼스: `QA 재배포 검증 20260701044809`
  - `campusId`: 6
  - `inviteCode`: `FL-877C2DS4`
  - 생성자 캠퍼스 권한: `MINISTER`
- 기도 운영 기간: `7월 기도 운영 20260701044809`
  - `seasonId`: 3
  - `startDate`: `2026-07-01`
  - 종료 QA 후 `endDate`: `2026-07-01`
  - 최종 상태: `CLOSED`
- 기도조: `믿음나눔조`
  - `groupId`: 7
  - 배정 멤버: `test2@naver.com`
- 기도제목 제출:
  - `submissionId`: 21
  - 내용: `QA 기도제목 20260701044809: 새 운영 기간이 잘 연결되게 해주세요.`

## API 결과

- `POST /api/v1/campuses`: 201 성공. 새 캠퍼스 생성 시 생성자 권한은 `MINISTER`.
- `GET /api/v1/admin/campuses/6/poll-templates?size=50`: 200 성공, 기본 커피 반복투표/템플릿 0개.
- `GET /api/v1/admin/campuses/6/prayer-seasons/current`: 생성 전 `null`, 생성 후 active season, 종료 후 다시 `null`.
- `POST /api/v1/admin/campuses/6/prayer-seasons`: 201 성공.
- `GET /api/v1/admin/prayer-seasons/3/members/assignable`: 200 성공. 배정 전 `assignable: true`, 조 배정 후 `assignable: false`.
- `POST /api/v1/admin/prayer-seasons/3/groups`: 201 성공.
- `PUT /api/v1/admin/prayer-groups/7/members`: 200 성공.
- `GET /api/v1/admin/prayer-seasons/3/groups`: 200 성공. 조/멤버 반영 확인.
- `GET /api/v1/campuses/6/prayers/weeks/2026-06-29`: 200 성공. `currentSeason`, `myGroupId`, `groups` 반영 확인.
- `PUT /api/v1/campuses/6/prayers/weeks/2026-06-29/submissions`: 200 성공. 제출 후 `submittedCount: 1`, `targetMemberCount: 1`.
- `PATCH /api/v1/admin/prayer-seasons/3/close`: 200 성공. `endDate` 저장 및 `status: CLOSED`.
- 종료 후 `GET /api/v1/campuses/6/prayers/weeks/2026-06-29`: 200 성공, `currentSeason: null`, `groups: []`.

## 추가 확인

- `weekStartDate`는 월요일이어야 함.
  - `2026-06-30` 호출 시 `PRAYER_INVALID_WEEK_START_DATE` 400 반환.
  - 정상 주차 값은 `2026-06-29`.
- 캠퍼스 2의 현재 상태:
  - `GET /api/v1/admin/campuses/2/prayer-seasons/current`: 200, `null`.
  - 즉 백엔드 기준 현재 운영 중인 기도 운영 기간은 없음.
- 커피 담당 상태:
  - `test@naver.com`: campus 2 active coffee duty.
  - `test2@naver.com`: campus 2 coffee duty inactive.
- 새 캠퍼스에서는 기본 커피 주문 투표가 생성되지 않음.
  - 기존 campus 2에는 과거 기본 커피 템플릿 `커피 주문 투표`가 남아 있음. 프론트에서는 숨기지만 DB 정리가 필요하면 백엔드/운영 작업 대상.

## UI 확인

- iPhone 17 Simulator에서 `test2@naver.com` 로그인 성공.
- 홈 헤더와 하단바 표시 확인.
- 관리자 홈 진입 확인.
- 관리자 우측 버튼은 `사용자`로 표시됨.
- 관리자 하단바 5개 탭은 iPhone 17에서 잘림 없이 표시됨.
- 관리자 > 경건 > 기도제목 > 운영 기간:
  - 운영 종료 후 `새 운영 기간 시작` 화면으로 전환됨.
  - 시작일은 오늘 날짜 표시만 있고 달력 선택 UI는 없음.

## 남은 이슈

- `GET /api/v1/admin/campuses/2/charges?...`는 `test2@naver.com` 매니저 토큰에서 401 `AUTH_UNAUTHORIZED`.
  - 캠퍼스 관리자/목회자 권한으로 정산 청구를 봐야 한다면 백엔드 권한 정책 확인 필요.
- 로그인 화면에서 이전 검증 메시지가 입력값 재입력 전까지 남아 보였음.
  - 실제 재입력 후 로그인은 성공했지만, UI polish 대상으로 기록.
- 기존 campus 2의 과거 커피 기본 템플릿은 API에 계속 존재함.
