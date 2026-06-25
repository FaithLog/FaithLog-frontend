# Figma v2 Token Alignment

Issue: #103

Figma source:
- File key: `RBpxs4ixQBwFUFHKg9ngh6`
- Node: `388:996`
- Node name: `Section / Foundations / Tokens`
- Frame: `450 x 408`
- Screenshot: `https://www.figma.com/api/mcp/asset/142184e0-9110-430f-ab51-3e86ed7f045a`

## Foundations Mapping

All color values in app source must resolve to one of these tokens.

| Token | Hex |
| --- | --- |
| `background` | `#F7F8FA` |
| `surface` | `#FFFFFF` |
| `primary` | `#3182F6` |
| `faith` | `#5BA8B0` |
| `mint` | `#92C7CF` |
| `danger` | `#EF4444` |
| `success` | `#22C55E` |
| `warning` | `#F59E0B` |
| `textPrimary` | `#191F28` |
| `textSecondary` | `#4E5968` |
| `textMuted` | `#8B95A1` |
| `borderSoft` | `#EEF1F4` |

Compatibility aliases in `src/theme.ts` are allowed only when their actual
values map to the table above. Other issue branches should import `colors`
from `src/theme.ts` instead of adding local palettes or direct hex values.

## Typography Mapping

Screen typography should stay on the Figma v2 scale:

| Role | Size | Weight |
| --- | --- | --- |
| Screen title | 24 | Bold (`700`) |
| Card title | 16 | Semi Bold (`600`) |
| Body and helper text | 15 | Regular (`400`) |

Use copy that fits on one line where possible. Do not expose implementation
terms such as API names, tokens, debug labels, or Figma frame names in user UI.

## Audit Result

Before #103, source used 30 unique raw color values, including beige, slate,
off-token green, soft warning/danger fills, and rgba overlays.

After #103, the raw color audit is limited to the 12 allowed Figma token values.
The only non-theme file with a raw color is `app.json`, where `#FFFFFF` matches
the `surface` token for Android adaptive icon background.

## Representative Figma Nodes Checked

These nodes were directly checked through the Figma file before the first #103
PR:

| Node | Name | Screen area |
| --- | --- | --- |
| `388:996` | `Section / Foundations / Tokens` | Foundations |
| `165:496` | `User 01 Login` | Login |
| `165:510` | `User 02 Signup` | Signup |
| `165:544` | `User 04 Home` | User home |
| `165:907` | `User 10 Profile` | Profile |
| `352:1580` | `User 09 Payment - 즉시 납부 완료` | Payment |
| `225:1313` | `User 11 Prayer Board - 조별 기도제목` | Prayer |
| `165:950` | `Admin 01 Home` | Admin home |
| `583:700` | `Admin 11 Notification Logs` | Notification admin |
| `165:1932` | `Status 09 Notification Sent` | Status UI |

## Screen Alignment Notes

| Area | Before | First #103 alignment |
| --- | --- | --- |
| Login / signup | Beige background, large brand-style title, dark primary buttons | Figma background token, FaithLog chip + 24px screen title, blue primary button, one-line helper copy |
| User home / profile | Local beige palette, dark CTA buttons, oversized numeric typography | Surface cards, borderSoft chips/buttons, primary text actions, 24/16/15 typography scale |
| Payment | Local card/chip/muted/success warning palette and rgba muted text | Payment local aliases map to global tokens; hero/list rows use surface cards and primary action color |
| Prayer | Existing shared aliases inherited off-token theme values | Prayer cards/progress/avatar tones now resolve to Figma token values and reduced font weights |
| Admin / campus cards | Heavy 800/900 weights and rgba modal overlay | Card/status typography reduced, overlay uses `textMuted`, admin cards inherit tokenized theme |
| Status UI | Generic stacked state card with chip label | Large centered state card with tokenized icon, concise message, and primary CTA direction |

## Gates

Run these checks before merging design work:

```bash
rg -n -e "#[0-9A-Fa-f]{3,8}|rgba?\(|hsla?\(" app.json src
rg -n -e "fontSize:\s*(10|11|12|13|14|17|18|19|20|21|22|23|25|26|27|28|29|3[0-9]|40)|fontWeight:\s*['\"](800|900)['\"]" src App.tsx
git diff --check
npm run typecheck
npm run lint
npm run test
```

Expected color gate result: only `src/theme.ts` token values and the allowed
`app.json` `#FFFFFF` value.
