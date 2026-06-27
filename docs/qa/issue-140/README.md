# Issue #140 QA

## Scope

- GitHub Issue #140: `[Figma Section 02][User Home] 사용자 홈·캘린더·내정보`
- Figma file: `FaithLog 모바일 와이어프레임 v2`
- Section nodes: `661:483`, `661:484`
- Implemented frame nodes:
  - `165:544` User 04 Home
  - `233:1383` User 04-1 Home - 기도제목 진입 제안
  - `234:1388` User 04-1 Home - 기도제목 상시 진입
  - `165:592` User 05 Monthly Calendar
  - `165:907` User 10 Profile
  - `234:1439` User 10-1 Profile - 공동체 메뉴

## Variant Interpretation

- 동일 번호 프레임은 같은 페이지의 상태 variant로 구현했다.
- `User 04`, `User 04-1`은 `UserHomeDashboard` 안에서 기도제목 API 상태에 따라 제안/상시 진입 variant를 렌더링한다.
- `User 10`, `User 10-1`은 `ProfileScreen` 안에서 프로필 카드, 공동체 메뉴, 계정 메뉴를 같은 화면 섹션으로 렌더링한다.
- 추가 route는 만들지 않았다.
- 일반 USER 홈은 단일 캠퍼스 정책을 따른다. 상단 캠퍼스 chip은 소속 표시 전용이며, 홈 우측은 캠퍼스 변경이 아니라 알림 진입 아이콘이다.

## Design Checks

- 홈 `경건생활` 섹션 제목은 `figmaSectionTitleLeft`를 적용해 왼쪽 정렬을 명시했다.
- 하단 메뉴바는 shell의 고정 영역으로 유지하며 콘텐츠와 분리했다.
- 월간 캘린더는 0/1/2/3개 완료 단계 범례와 셀 tone 함수를 유지해 #126 heatmap 규칙을 수용한다.
- API Docs 확인 결과 홈 전용 집계 API는 없으므로 기존 사용자/캠퍼스/경건/청구/투표/기도제목 API 조합만 사용했다.

## Screenshots

- `user-04-home-prayer-suggestion.png`: iOS Simulator / Expo, mock 기도제목 OPEN 상태.
- `user-04-home-prayer-always.png`: iOS Simulator / Expo, QA 중 mock 기도제목 CLOSED 임시 상태로 캡처 후 원복.
- `user-04-home-rework.png`: iOS Simulator / Expo, 홈 재작업 후 Figma `User 04` 기본 구조, 알림 진입, 기도제목 card variant 확인.
- `user-04-home-no-entry-cards.png`: iOS Simulator / Expo, 로그인 성공 배너와 자동 알림 권한 prompt 없이 진입한 홈.
- `user-05-monthly-calendar.png`: iOS Simulator / Expo, 7열 월간 캘린더 화면.
- `user-10-profile-community-menu.png`: iOS Simulator / Expo production bundle mode, Profile 공동체 메뉴.
- `user-10-profile-notification-row.png`: iOS Simulator / Expo, Profile 계정 섹션의 알림 설정 row.
- `user-10-profile-notification-settings.png`: iOS Simulator / Expo, 별도 알림 설정 subview.

Note: `user-05-monthly-calendar.png`는 기존 10열처럼 보이던 캘린더 캡처를 7열 최신 캡처로 교체했다. Expo Go tools overlay가 일부 캡처에 남아 있어 코드/레이아웃 검증은 PM이 로컬 실행으로 재확인한다. QA용 임시 mock/route 변경은 최종 diff에 남기지 않았다.

## Validation

- `git diff --check`: pass
- `npm run typecheck`: pass
- `npm run lint`: pass with existing warnings in `src/polls/PollScreen.tsx` and pre-existing unused helpers in `src/root/FaithLogApp.tsx`
- `npm run test`: pass, 5 files / 27 tests

## Remaining Risk

- Figma `User 04-1` variants depend on current prayer week API availability and status. If backend returns unavailable/empty data, the screen falls back to the always-entry state and documents the data issue through existing error messaging.
- Monthly calendar currently maps backend monthly weekly summaries and selected weekly checks into 0-3 completion tones. A future #126 monthly daily API can plug into the same daily completion count boundary.
