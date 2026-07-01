# 2026-07-01 남은 UI/계좌 라우팅 QA

## 범위

- 실행 시각: 2026-07-01 15:59 KST
- 배포 API: `https://faithlog-549871256004.asia-northeast3.run.app`
- iOS Simulator: iPhone 17, Expo Go, Metro `exp://10.89.194.48:8102`
- 계정: `test2@naver.com` 매니저 계정
- 캠퍼스: `QA 계좌 라우팅 20260701050527`, `campusId: 7`
- 위험한 데이터 변경 액션은 실행하지 않고 표시/이동/필터/요청 직전 상태까지 확인했다.

## 확인 결과

| 영역 | 결과 | 확인 내용 |
| --- | --- | --- |
| 사용자 홈 | PASS | 헤더/하단바가 사용자 화면 톤으로 정렬됨. 캠퍼스명은 지역명 없이 캠퍼스명만 표시되고 긴 이름은 말줄임 처리됨. |
| 홈 카드 | PASS | 캘린더, 조별 기도제목, 기도제목 입력, 최근 청구 항목 카드가 같은 높이/아이콘 구조로 보임. |
| 관리자 진입 | PASS | 매니저 계정에서 사용자 홈의 `관리자` 버튼을 누르면 선택 모달 없이 캠퍼스 관리자 홈으로 이동함. |
| 관리자 하단바 | PASS | 홈/멤버/경건/투표/정산 하단바가 iPhone 17 화면에서 잘림 없이 표시됨. |
| 멤버 관리 | PASS | 초대코드 row, 멤버/역할/커피담당 분리 구조 확인. 역할 탭의 목록 row에는 즉시 역할 변경 버튼이 없고 상세 진입 중심. |
| 관리자 정산 | PASS | 청구 탭에서 벌금/커피 필터가 즉시 반영됨. 계좌 탭에서 벌금/커피 계좌가 각각 표시됨. |
| 사용자 납부 | PARTIAL | 커피 필터 선택 시 2건에서 1건으로 즉시 변경되고 커피 계좌가 표시됨. 다만 `전체` 필터와 `납부 완료` 라벨이 남아 있어 최근 요구와 일부 다름. |
| 관리자 투표 생성 | PARTIAL | `커피 주문` 유형은 생성 탭에 표시됨. 커피 메뉴/사용자 항목추가 ON은 보임. 그러나 계좌 선택 단계에서 내 커피 계좌가 없다고 판단되어 생성 버튼이 비활성화됨. |
| 반복 투표 | PASS | 현재 QA 캠퍼스에는 반복 템플릿이 없어 빈 상태와 `새 반복` 버튼만 확인. 추천 커피 템플릿은 노출되지 않음. |
| 경건 현황 | PASS | 경건/기도제목 하위 탭 분리와 주간 현황 카드 표시 확인. |
| 기도 운영 기간 | PASS | 현재 캠퍼스는 active season이 없어 `새 운영 기간 시작` 화면이 표시됨. 시작일은 오늘 날짜 표시만 있고 달력 선택 UI 없음. |
| 기도 조 관리 | PARTIAL | active season이 없으면 조 저장은 `다음` 버튼 disabled로 막힘. 다만 리스트의 `조 생성` 버튼은 눌러져 폼까지 진입할 수 있어 더 명확한 비활성 처리가 필요함. |
| 사용자 조별 기도제목 | PARTIAL | 하단바는 유지되고 운영 기간 없음 empty state가 표시됨. 다만 상단 뱃지가 `입력 가능`으로 떠서 empty state와 문구가 충돌함. |

## API 근거

### 커피 계좌 선택 문제

`GET /api/v1/campuses/7/payment-accounts` 응답은 200이지만 계좌 목록에 `ownerUserId`가 포함되지 않는다.

```json
{
  "user": {"id": 37, "email": "test2@naver.com", "role": "MANAGER"},
  "accounts": [
    {"id": 15, "nickname": "QA 벌금 20260701050527", "accountType": "PENALTY"},
    {"id": 16, "nickname": "QA 커피 20260701050527", "accountType": "COFFEE"}
  ]
}
```

현재 프론트는 커피투표 생성 시 `ownerUserId === currentUserId`인 커피 계좌만 선택 가능하게 거른다. 목록 응답에 `ownerUserId`가 없으면 이미 존재하는 내 커피 계좌도 선택할 수 없다.

필요 조치 후보:

- 백엔드: 계좌 조회 응답에 `ownerUserId`를 항상 포함한다.
- 프론트: 백엔드 보강 전까지 owner 정보가 없는 계좌를 어떻게 처리할지 정책 결정이 필요하다. 단, 아무 ownerless 계좌나 허용하면 “내가 만든 커피 계좌만” 조건이 깨진다.

### 기도 운영 기간

현재 QA 캠퍼스 7의 배포 API 상태:

- `GET /api/v1/admin/campuses/7/prayer-seasons/current`: 200, `data: null`
- `GET /api/v1/campuses/7/prayers/weeks/2026-06-29`: 200, `currentSeason: null`, `groups: []`, `status: OPEN`

따라서 이 캠퍼스에서 운영 종료가 아니라 새 운영 기간 시작 화면이 보이는 것은 API 상태와 일치한다.

## 수정 후보

1. 관리자/커피담당자 커피투표 생성에서 기존 내 커피 계좌를 선택하지 못하는 문제
   - 프론트 단독으로 고치려면 ownerless 계좌 허용 정책이 필요하다.
   - 권장 백엔드 보강: `paymentAccountId`, `ownerUserId`, `accountType`, `isActive`를 계좌 목록 응답에 포함.
2. 사용자 납부 필터
   - 최근 요구대로 유형 필터는 `벌금/커피`, 상태 필터는 `미납/납부/면제/취소` 중심으로 재정리 필요.
3. 조별 기도제목/기도제목 입력 empty state
   - 운영 기간이 없을 때 상단 `입력 가능` 뱃지를 숨기거나 `운영 전`으로 변경 필요.
4. 관리자 기도 조 관리
   - active season이 없으면 `조 생성` 버튼 자체를 disabled 또는 안내형으로 바꾸는 편이 덜 혼란스럽다.

## 자동 검증

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS, 12 files / 71 tests
- `git diff --check`: PASS
- `EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app npx expo export --platform android --output-dir /tmp/faithlog-android-export-check`: PASS
  - Android JS bundle 생성 성공: `_expo/static/js/android/AppEntry-660393f87ac23c8fce1350ec2b8676b1.hbc`

## 결론

- 핵심 계좌 라우팅 데이터는 이전 QA처럼 배포 API 기준 정상 생성/조회된다.
- 현재 남은 가장 큰 실제 UI 결함은 커피투표 생성 화면이 계좌 목록 응답의 `ownerUserId` 누락 때문에 기존 커피 계좌를 선택하지 못하는 점이다.
- Android `Unable to load script`는 이번 export 성공 기준으로 JS 코드 번들 생성 실패는 아니며, Metro 연결/개발 앱 번들 포함 상태 문제로 보는 것이 타당하다.
