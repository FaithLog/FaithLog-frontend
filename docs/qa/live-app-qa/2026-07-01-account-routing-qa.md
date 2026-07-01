# 2026-07-01 커피/벌금 계좌 라우팅 QA

## 범위

- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- 계정: `test2@naver.com` 매니저 계정
- 목적:
  - 벌금 청구가 벌금 계좌에 연결되는지 확인
  - 커피투표 청구가 커피 계좌에 연결되는지 확인
  - 관리자 정산 조회에서 `paymentAccountId` 필터가 동작하는지 확인

## 생성한 QA 데이터

- 캠퍼스: `QA 계좌 라우팅 20260701050527`
  - `campusId`: 7
  - `inviteCode`: `FL-GVH8ZN9E`
  - 생성자 캠퍼스 권한: `MINISTER`
- 벌금 계좌:
  - `paymentAccountId`: 15
  - 별칭: `QA 벌금 20260701050527`
  - 은행: 카카오뱅크
  - `ownerUserId`: 37
- 커피 계좌:
  - `paymentAccountId`: 16
  - 별칭: `QA 커피 20260701050527`
  - 은행: 토스뱅크
  - `ownerUserId`: 37
- 벌금 규칙:
  - `QUIET_TIME`
  - 기준 1회, 단위 금액 1,000원
- 커피 투표:
  - pollId: 26
  - 제목: `QA 커피 계좌 검증 20260701050527`
  - 선택 메뉴: 에스프레소
  - 금액: 1,500원
  - `paymentAccountId`: 16

## 결과

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 벌금 청구 생성 | PASS | 경건 제출 후 `경건생활 벌금` 1,000원 생성 |
| 벌금 계좌 연결 | PASS | 청구 item id 19의 `account.paymentAccountId`가 15 |
| 커피 청구 생성 | PASS | 커피투표 응답 후 종료 시 `에스프레소` 1,500원 생성 |
| 커피 계좌 연결 | PASS | 청구 item id 20의 `account.paymentAccountId`가 16 |
| 사용자 납부 목록 | PASS | `/charges/me`에 벌금 1,000원 + 커피 1,500원, 총 2,500원 표시 |
| 관리자 계좌 필터 | PASS | `paymentAccountId=15` 벌금 조회 1,000원, `paymentAccountId=16` 커피 조회 1,500원 |

## API 확인

- `POST /api/v1/admin/campuses/7/payment-accounts`: 벌금/커피 계좌 생성 성공
- `POST /api/v1/admin/campuses/7/penalty-rules`: 벌금 규칙 생성 성공
- `PUT /api/v1/campuses/7/devotions/me/weeks/2026-06-29`: 벌금 청구 생성 성공
- `POST /api/v1/admin/campuses/7/polls`: 커피투표 생성 성공
- `PUT /api/v1/campuses/7/polls/26/responses/me`: 커피투표 응답 성공
- `PATCH /api/v1/admin/campuses/7/polls/26/close`: 커피 청구 생성 성공
- `GET /api/v1/admin/campuses/7/charges?paymentCategory=PENALTY&paymentAccountId=15&status=UNPAID`: 1,000원 조회
- `GET /api/v1/admin/campuses/7/charges?paymentCategory=COFFEE&paymentAccountId=16&status=UNPAID`: 1,500원 조회

## 참고

- `status=ALL` 같은 UI용 필터값이 query에 새어 나가지 않도록 `src/api/client.test.ts`에 회귀 테스트를 추가했다.
- 존재하지 않는 `paymentAccountId`로 조회하면 404 `BILLING_PAYMENT_ACCOUNT_NOT_FOUND`가 반환되어, 배포 API가 계좌 필터를 무시하지 않는 것을 확인했다.

## 프론트 시뮬레이터 QA

- iPhone 17 Simulator에서 `test2@naver.com` 로그인 상태로 확인.
- 캠퍼스 전환 sheet에서 `QA 계좌 라우팅 20260701050527` 캠퍼스로 이동 확인.
- 사용자 홈:
  - 이번 달 미납 `2.5k원` 표시 확인.
  - 최근 청구 항목 카드가 `2.5k원 미납`으로 표시됨.
- 납부 탭:
  - 총 미납 금액 `2,500원`, 청구 항목 `2건`.
  - 전체 필터: 에스프레소 1,500원 + 경건생활 벌금 1,000원 표시.
  - 커피 필터: 에스프레소 1,500원만 표시, `토스뱅크 · FaithLog QA` 계좌 표시.
  - 벌금 필터: 경건생활 벌금 1,000원만 표시, `카카오뱅크 · FaithLog QA` 계좌 표시.
  - 납부 계좌 영역에 `QA 벌금 20260701050527`, `QA 커피 20260701050527` 둘 다 표시.
- 관리자 > 정산:
  - 청구 탭 기본 벌금 필터에서 이번 달 총 미납 `1,000원`.
  - 커피 필터 선택 시 이번 달 총 미납 `1,500원`으로 즉시 변경.
  - 계좌 탭에서 활성 납부 계좌 `2개`, 벌금/커피 계좌 각각 표시.
- 내정보 > 커피 정산 관리:
  - coffee duty 계정에서 진입 카드 노출 확인.
  - 정산 탭에서 커피 정산 `1,500원`, 미납 1명, 커피 계좌 1개 표시.
  - 계좌 탭에서 활성 커피 계좌 `QA 커피 20260701050527`, 토스뱅크 계좌번호/예금주 표시.
