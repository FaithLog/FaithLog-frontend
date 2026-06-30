# Issue 136 Poll Figma Section QA

Date: 2026-06-29

Environment:
- Expo web static export
- `EXPO_PUBLIC_MOCK_MODE=true`
- viewport: 390 x 844, deviceScaleFactor 2
- static build output: `dist-issue-136/`

Captured screens:
- `user-poll-list.png`
- `user-poll-detail-options.png`
- `user-poll-detail-submit.png`
- `user-poll-comments.png`
- `user-poll-results.png`
- `admin-home.png`
- `admin-poll-manage.png`
- `admin-poll-create.png`
- `admin-poll-create-type.png`
- `admin-poll-create-saturday-detail.png`
- `admin-poll-create-deadline-error.png`
- `admin-poll-create-detail-top.png`
- `admin-poll-create-datetime-picker.png`
- `admin-poll-create-detail.png`
- `admin-poll-create-coffee-detail.png`
- `admin-poll-create-coffee-menu-modal.png`
- `admin-poll-create-disabled-reason.png`
- `admin-poll-templates.png`
- `admin-poll-template-start-datetime-picker.png`
- `admin-poll-repeat-main.png`
- `admin-poll-repeat-wizard-info.png`
- `admin-poll-repeat-wizard-schedule.png`
- `admin-poll-repeat-wizard-schedule-error.png`
- `admin-poll-repeat-coffee-menu-modal.png`
- `admin-poll-repeat-coffee-menu-selected.png`
- `admin-poll-repeat-wizard-confirm.png`
- `admin-poll-repeat-create-success.png`
- `admin-poll-results-respondents.png`

Checks:
- User poll list, detail options, comments, and results render in the Figma Section 04 flow.
- Response submit button stays below the option area, not as a floating mid-screen action.
- Admin poll management and templates remain inside the admin screen, separate from the user Poll tab.
- Admin poll screens do not render the user bottom nav; user Poll screens still render the user bottom nav.
- Admin mode no longer shows the main admin section switcher as a top row; campus admin sections move through the fixed bottom admin nav.
- Admin poll create/templates screens show a coffee poll template entry. If the API response has no active COFFEE template, the UI injects a non-persisted default coffee preset for selection/editing.
- Repeat poll/template counts exclude the frontend-only default coffee preset. Recommended presets remain visible with a badge, but they are not counted as saved backend repeat polls.
- Repeat poll management now shows saved repeat poll cards in the main poll screen. The repeat create/edit flow opens as a dedicated subview with 4 steps: poll info, repeat schedule, options, and confirm.
- Saving a repeat poll returns to the admin poll management list, where the newly created repeat poll appears in the repeat poll settings area.
- Coffee poll create shows the disabled reason next to the create CTA when a coffee billing account or coffee duty assignment is missing.
- Saturday direct poll create does not show coffee billing/duty disabled reasons. Direct create refreshes `startsAt` at submit time and blocks past/current deadlines with an inline deadline error before API submission.
- Admin poll create is split into Figma-style Type and Detail steps. The Type step does not show a template list, and the Detail step uses rounded cards for title, deadline, options, selection mode, and anonymous toggle.
- Admin poll deadline uses the inline date/time picker. Repeat poll start/end use weekday plus time controls only, and block schedules where the end is not after the start.
- Admin bottom nav in the create flow uses the Figma 5-item structure: home, members, devotion, polls, settlement.
- Coffee poll create does not expose internal `menu:<id>` text. Coffee options are selected from the coffee menu sheet and render as menu name plus price.
- Coffee repeat poll options use the same coffee menu sheet; selected repeat options render as menu name plus price.
- Admin/user poll result screens show non-anonymous respondents by option. Anonymous results hide respondent names.
- Poll response memo is not rendered and is not sent in the save response payload.
- No large success/info notice banner is rendered for poll actions.
- Mock fixtures cover coffee, custom multiple, Wednesday submitted/closed, and Saturday open states.

Notes:
- API docs at `/Users/josephuk77/FaithLog/src/docs/asciidoc/index.adoc` do not currently expose Poll sections; implementation stayed within existing client/adminPollApi contracts.
- User-added response options are not exposed in the current API docs/client contracts, so no fake toggle/UI was added.
- Repeat poll create/update is represented only through API-supported template fields: `autoCreateEnabled`, `startDayOfWeek`, `startTime`, `endDayOfWeek`, and `endTime`. No unsupported scheduler state was invented.
- The default coffee poll template fallback is frontend-only. It is not auto-saved; saving it creates a normal template, and using it for poll creation sends direct options with no backend template id.
