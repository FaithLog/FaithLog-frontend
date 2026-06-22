# Figma Issue 25 Final Cleanup

## 기준

- Issue: `#25` / `FE-023 Figma 최종 정리와 화면 누락 해소`
- Figma file: `FaithLog 모바일 와이어프레임 v2`
- File key: `RBpxs4ixQBwFUFHKg9ngh6`
- 실제 기준 페이지: `디자인 변경` (`163:479`)
- 명칭 표준: `Service ADMIN`

## 완료된 Figma 정리

- `API Docs Missing Screens`의 필수 프레임 9개를 `디자인 변경` 페이지로 이동했다.
- `디자인 변경` 페이지에서 `API Docs /` prefix는 0개다.
- `디자인 변경` 페이지에서 `서비스 ADMIN` 잔여 텍스트는 0개이며, `Service ADMIN`으로 통일했다.
- 중복/실험 시안은 `Archive - 중복·실험 시안` 페이지로 분리했다.
- `Warm Campus Notebook v1`은 `Archive - Warm Campus Notebook v1` 페이지로 분리했다.
- 기존 `API Docs Missing Screens` 페이지는 `Archive - API Docs Missing Screens (moved)`로 남겼고 childCount는 0이다.

## 이동/정리된 프레임

- `Service ADMIN 01 Home`
- `Service ADMIN 02 Users List`
- `Service ADMIN 03 Campus Management`
- `Notification 01 Permission`
- `Admin 10 Notification Send`
- `Admin 11 Notification Logs`
- `Common 01 Danger Confirm Sheet`
- `Admin 12 Billing Account Detail`
- `Service ADMIN 04 Campus Edit Confirm`

## 확인된 기존 프레임

- `Admin 05 Devotion Missing`
- `Admin 09 Poll Missing`

## 검증 결과

- `디자인 변경` childCount: `128`
- `Archive - 중복·실험 시안` childCount: `65`
- `Archive - Warm Campus Notebook v1` childCount: `12`
- 필수 이동 프레임 9개 모두 `디자인 변경` 페이지에서 확인됨

## Repo 반영 기준

- repo UI copy와 accessibility label은 `Service ADMIN` 표준을 유지한다.
- 이 작업은 Figma 직접 정리 결과를 기록하는 문서 변경만 포함한다.
- token, secure storage, API client, 401/403/409 처리 로직은 변경하지 않았다.
