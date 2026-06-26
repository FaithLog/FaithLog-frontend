# Issue 139 Non-Bottom Icon QA

Date: 2026-06-26
Branch: `codex/issue-139-non-bottom-icons`

## Scope

- Replaced text-symbol UI icons outside the bottom navigation with `IconexIcon`.
- Replaced the previous React Native `View` primitive approximation with SVG exported from the Figma Iconex component nodes.
- Added `react-native-svg` so the exported SVG/path geometry is rendered directly in React Native/Expo.
- Intentionally did not modify `src/root/FaithLogApp.tsx` bottom navigation icons.
- Kept API contracts and backend behavior unchanged.

## Screens Covered By Code Review

- `src/components/ui.tsx`: shared icon button and state-card icon presentation.
- `src/polls/PollScreen.tsx`: poll option selection marks and poll list type icons.
- `src/devotion/DevotionScreen.tsx`: weekly devotion quick-check pills.
- `src/devotion/MonthlyCalendarScreen.tsx`: monthly calendar quick-check buttons.
- `src/payments/PaymentScreen.tsx`: account-missing, payment status, and charge item icons.
- `src/admin/AdminScreen.tsx`: settlement, payment account, penalty rule, and charge status icons.
- `src/admin/ServiceAdminScreen.tsx`: role-selection radio indicator.

## Text Symbol Sweep

Command:

```bash
rg -n "✓|○|□|▤|₩|●" src -g '*.tsx'
```

Result:

- Remaining matches are only in `src/root/FaithLogApp.tsx` bottom navigation, which is explicitly excluded from this issue.
- User-visible money values rendered by `formatWon` remain valid currency text, not icon placeholders.

## Automated Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `npm run lint` | PASS with warnings | Exit code 0. Existing unused warnings remain in `src/polls/PollScreen.tsx` and `src/root/FaithLogApp.tsx`. |
| `npm run test` | PASS | 5 files, 27 tests passed. |
| `git diff --check` | PASS | No whitespace errors. |

## Mock/Simulator QA

Attempted Expo web mock mode without Docker/backend:

```bash
EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app npm run web -- --host localhost --port 19099
EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app npm run web -- --host localhost --port 19139
```

Result: BLOCKED. Expo reported each selected port as already in use and skipped the dev server in non-interactive mode. `curl` to both localhost ports failed to connect, so screenshots were not produced in this environment.

Retried after the SVG change:

```bash
EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app npm run web -- --host localhost --port 19143
EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_API_BASE_URL=https://faithlog-549871256004.asia-northeast3.run.app npx expo start --web --host localhost --port 19144 --non-interactive
```

Result: BLOCKED again. Expo stayed in offline dependency validation, then reported the selected port as already used and prompted `Use port null instead?`; `curl -I http://localhost:19143` and `curl -I http://localhost:19144` both failed to connect. Representative app screenshots could not be produced from this environment.

## Figma Icon Node Basis

Icon mappings are now based on direct Figma Plugin API `exportAsync({format: 'SVG'})` output from the Iconex table nodes provided for issue #139. `src/components/IconexIcon.tsx` keeps the node id map in `iconexIconNodeIds` and renders the exported SVG XML through `SvgXml`.

- Check `191:880`
- Home `191:957`
- Document `191:664`, Document 2 `191:670`
- Category `191:923`, Category 2 `191:929`
- Wallet `191:641`, Credit card `191:648`, Receipt `191:653`, Coins `191:661`
- Calendar `191:716`
- Bell `191:962`, Send `191:968`
- Message circle `191:939`, Message square `191:948`
- User `191:1209`, Users `191:1213`, Add user `191:1224`
- Settings `191:1081`
- Plus `191:865`, Close `191:874`, Danger `191:903`, Trash can `191:1059`
- Lock `191:739`, Lock open `191:744`, Lock check `191:749`, Lock x `191:754`

## Figma Export Comparison Evidence

Stored Figma source PNG exports:

- `docs/qa/issue-139/figma-check-191-880.png`
- `docs/qa/issue-139/figma-calendar-191-716.png`
- `docs/qa/issue-139/figma-bell-191-962.png`
- `docs/qa/issue-139/figma-wallet-191-641.png`
- `docs/qa/issue-139/figma-user-191-1209.png`

Representative geometry checks:

- Check `191:880`: exported SVG contains the 20x20 rounded rectangle at `x=2`, `y=2`, `rx=5`, plus the check path `M9.5 11.5L11.5 13.5L15.5 9.5`.
- Calendar `191:716`: exported SVG contains the rounded outer rect, the top divider, binder strokes at `x=7.5` and `x=16.5`, and six internal date marker paths at rows `12.5` and `16.5`.
- Bell `191:962`: exported SVG uses the Figma expanded bell vector fill plus the bottom clapper stroke.
- Wallet `191:641`: exported SVG contains the outer wallet rect, rear folded path, inner balance line, side pocket path, and pocket dot path.
- User `191:1209`: exported SVG contains the transformed head circle and Figma body contour path with the lower outline and shoulder geometry.

Implementation notes:

- Default stroke width is now `1.5`, matching Iconex Light exports.
- The source color `#4E4F53` is replaced at render time by the `color` prop so existing theme-token colors continue to work.
- Existing `strokeWidth` prop compatibility is preserved for stroke-based SVG elements.
