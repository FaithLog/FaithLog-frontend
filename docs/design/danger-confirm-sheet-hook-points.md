# Danger Confirm Sheet Hook Points

Issue #72 added `DangerConfirmSheet` as the shared bottom-sheet pattern for destructive confirmations.

## Connected Flows

- `LogoutConfirmSheet` in `src/root/FaithLogApp.tsx`
- Service ADMIN global role change confirm in `src/admin/ServiceAdminScreen.tsx`

## Remaining Hook Points

- `DeleteMemberSheet` in `src/admin/AdminScreen.tsx`
  - Use for campus member deactivate/remove confirmation.
- `DeactivatePaymentAccountSheet` in `src/admin/AdminScreen.tsx`
  - Use for payment account deactivate confirmation.
- `PrayerSeasonCloseSheet` in `src/admin/AdminScreen.tsx`
  - Use for prayer season close confirmation.
- `ChargeStatusConfirmSheet` in `src/admin/AdminScreen.tsx`
  - Use danger styling when the target status is `CANCELED`.
- Service ADMIN campus deactivate confirm in `src/admin/ServiceAdminCampusSection.tsx`
  - Use for campus pause/deactivate confirmation.

## Migration Notes

- Pass domain details through `message`, `dangerSummary`, and optional `children`; keep the shared component domain-neutral.
- Keep submit state in the caller and pass it with `loading` and `loadingLabel`.
- Keep failure visible in the sheet with `failureMessage` so users can retry or cancel from the same context.
- Confirm buttons should remain destructive red for irreversible or high-impact operations.
