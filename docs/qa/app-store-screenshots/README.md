# App Store Screenshot QA

Date: 2026-07-01
Device targets checked:
- iPhone 17, 1206 x 2622
- iPhone 17e, 1170 x 2532
- iPhone 17 Pro Max, 1320 x 2868

## Captured Files

- `iphone17-01-home.png`: user home, iPhone 17
- `iphone17-02-calendar.png`: monthly calendar, iPhone 17
- `iphone17-03-prayer-groups.png`: prayer groups with active data, iPhone 17
- `iphone17-04-polls-empty.png`: polls empty state, iPhone 17
- `iphone17-05-payments.png`: payments screen, iPhone 17
- `iphone17-06-profile.png`: profile screen, iPhone 17
- `iphone17-07-devotion.png`: devotion check screen, iPhone 17
- `iphone17e-01-home.png`: user home, compact iPhone check
- `iphone17e-02-devotion.png`: devotion screen, compact iPhone check
- `iphone17promax-01-home-current.png`: user home, Pro Max
- `iphone17promax-02-calendar.png`: monthly calendar, Pro Max
- `iphone17promax-03-prayer-groups-empty.png`: prayer groups empty state, Pro Max
- `iphone17promax-04-polls-empty.png`: polls empty state, Pro Max
- `iphone17promax-05-payments-empty.png`: payments empty state, Pro Max
- `iphone17promax-06-profile.png`: profile screen, Pro Max

## QA Notes

- Header and bottom navigation were checked on compact and large iPhone sizes.
- Home cards, calendar, prayer group entry, polls, payments, and profile screens remained within safe areas.
- The prayer group screenshot currently shows an empty operating-period state because the logged-in QA campus has no active prayer operating period.
- The polls and payments screenshots currently show empty states because the logged-in QA account has no active polls or charges.
- Expo Go QA previously crashed when native Firebase modules were not present. The app now skips native Firebase initialization when those modules are unavailable, while real native builds can still initialize Firebase.

## App Store Readiness Notes

- These are functional QA captures and App Store screenshot candidates.
- For final marketing screenshots, seed realistic active data for prayer groups, polls, and payments before capture.
- Avoid using screenshots that expose real personal data or unstable QA data.
