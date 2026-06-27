# Issue 126 iOS Simulator QA

Date: 2026-06-27

Device: iPhone 17 Simulator, iOS 26.5
Screenshot size reported by XcodeBuildMCP: 368x800

Run command:

```bash
EXPO_PUBLIC_APP_ENV=preview \
EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app \
npx expo start --ios --host lan --port 19127
```

Final reload command used after formatter changes:

```bash
EXPO_PUBLIC_APP_ENV=preview \
EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app \
npx expo start --ios --host lan --port 19127 --clear
```

Notes:

- Docker/backend local execution was not used.
- Mock mode was not used for final QA.
- Expo web was started briefly as a discarded smoke attempt before PM correction; no web capture is used as completion evidence.
- `--host localhost` left Expo Go on "Opening project..."; restarting with `--host lan` loaded the iOS app successfully.
- Expo Go held a stale experience once; final QA terminated `host.exp.Exponent` and reopened `exp://10.89.194.48:19127`, after which Metro logged `iOS Bundled`.

Captures:

- `ios-simulator-home-no-quick-save-notice.jpg`: Home starts directly at the campus chip/name and today's FaithLog area. No global `빠른 체크 저장` success card is present, and unpaid amount renders as `4k원`.
- `ios-simulator-monthly-calendar.jpg`: Monthly calendar, fixed bottom nav, no separate Home CTA, visible 0/1/2/3 intensity legend and colored cells. Submitted week quick checks are locked.
- `ios-simulator-weekly-input-top.jpg`: Calendar-selected 6/30 opens the editable 6/29-7/5 weekly input state with left-aligned `경건생활`.
- `ios-simulator-weekly-input-bottom.jpg`: Weekly input scroll bottom, live penalty estimate, late-minutes input, save/submit controls above the fixed bottom nav. Toggling Monday QT changed total estimate from `6,500원` to `6,000원` in Simulator.
- `ios-simulator-submit-confirm-modal.jpg`: Weekly submit button opens the non-editable warning modal before any submit API call and includes the current estimated penalty.
- `ios-simulator-weekly-submitted-locked.jpg`: Submitted/locked state with `잠김`, submission time, read-only status, submitted-week estimated penalty, and previous/next week controls.
- `ios-simulator-locked-week-navigation-entry.jpg`: Tapping the locked screen's previous-week control opened the 6/15-6/21 editable weekly input state, proving week navigation flows back through the normal submitted/unsubmitted screen mode switch.
- `ios-simulator-devotion-penalty-result.jpg`: Penalty result cause summary with rule-based estimated won amounts; billing CTA remains available.
