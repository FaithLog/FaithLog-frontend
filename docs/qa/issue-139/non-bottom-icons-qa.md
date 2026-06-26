# Issue 139 Non-Bottom Icon QA

Date: 2026-06-26
Branch: `codex/issue-139-non-bottom-icons`

## Scope

- Replaced text-symbol UI icons outside the bottom navigation with `IconexIcon` React Native view icons.
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
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully after `npm ci`. |
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

## Figma Icon Node Basis

Icon mappings were based on the Iconex table nodes provided for issue #139:

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
