# FaithLog Farm HUD — v1

Individual transparent, retina-ready **192×192 PNG icons**, with editable **96×96 SVG sources**, styled to match production `src/theme.ts`.

Includes 6 care actions, 5 status icons, 6 emotional states, 4 effects, and 3 evolution badges (24 total). No icon contains embedded Korean text; labels live in React Native and are accessible and localizable.

**Use**: prefer `FarmHudIcon` and `FarmHudGauge` in `src/companions/farmHud` for React Native. Gauge fills, buttons, labels, active states, and numerical values must be native components, not screenshots. `preview.jpg` is a contact sheet only.

**Scope**: art assets and reusable presentational components; does not claim farm care API, affinity, food, illness or evolution mechanics are implemented, and does not modify the existing home screen.

Source design colors: primary blue `#2368D3`, faith teal `#2E7078`, mint `#92C7CF`, background `#F7F8FA`, white surfaces.

Interactive static preview: [preview.html](preview.html) (serve the folder with any static HTTP server).
