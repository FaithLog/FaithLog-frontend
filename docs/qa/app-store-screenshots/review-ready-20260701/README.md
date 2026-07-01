# Review-Ready Screenshot Pass

Date: 2026-07-01

## Demo Data

- Run ID: 20260701100047
- Campus: 은혜숲 청년부
- Campus ID: 16
- Primary demo user: 김하은
- Invite code: FL-Z3YAAQB5
- Prayer season: 2026 여름 기도 나눔 (seasonId 5)
- Prayer groups:
  - 믿음나눔조: 김하은, 이준서, 박민재
  - 소망기도조: 최서윤, 정다은, 한지호
- Custom poll: 7월 청년부 소풍 장소를 골라주세요 (pollId 30)
  - 한강공원 피크닉
  - 북악산 산책
  - 성수동 카페 투어
- Coffee poll: 주일 예배 후 커피 주문 (pollId 31)
  - 아메리카노 1,500원

## Captured Files

- `iphone17-01-home-demo.png`: natural campus and user home
- `iphone17-02-prayer-groups-demo.png`: prayer group list with real-looking participation data
- `iphone17-03-prayer-detail-demo.png`: prayer group detail with real-looking prayer contents
- `iphone17-04-polls-demo.png`: poll list with realistic custom poll data
- `iphone17-05-poll-detail-demo.png`: poll detail with names and option results

## Backend QA Results

Passed:
- COFFEE active account separation by `ownerUserId`
- COFFEE poll creation rejects another user's coffee account
- COFFEE poll close creates an unpaid charge with the selected menu price
- Coffee charge is linked to the selected `paymentAccountId`
- Admin charge query with `paymentAccountId` filter works for coffee charges
- New campus did not receive a default coffee repeat poll template

Failed / Needs Backend Follow-Up:
- `POST /api/v1/admin/campuses/{campusId}/payment-accounts` with `PENALTY` returned `401 AUTH_UNAUTHORIZED`.
- `GET /api/v1/admin/campuses/{campusId}/charges?...` with a campus `MINISTER` account returned `401 AUTH_UNAUTHORIZED`.

## Screenshot Caveats

- Captures were taken through Expo Go. If a development floating tool button is visible in review, recapture from a release/TestFlight build before App Store Connect upload.
- The iOS password-save prompt was dismissed before this pass; these captures do not include the password-save dialog.
- A production Metro attempt on port 8105 failed in Expo Go with a development-server connection redbox, so the saved captures use the stable preview Metro on port 8104.
- Simulator UI automation exposed home cards, prayer screens, and poll screens reliably. Payment/admin captures were not regenerated in this pass.
