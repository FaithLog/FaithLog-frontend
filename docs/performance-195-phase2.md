# Issue #195 phase 2 evidence and dependency

## Measurement rules

- Native cold start is measured from a Production Release build on the same simulator or emulator, host, app data state, and backend fixture. Record at least five runs and report the median native first-frame metric.
- Test runner or UI automation wall time is not a native first-frame metric.
- Request counts are asserted with deterministic request mocks for Home first entry and fresh-cache re-entry, Calendar first month and same-month week changes, Payment filter/sort/page changes, and Poll mutations.
- JS/UI FPS and memory are not considered passing without a profiler trace captured under equivalent conditions.
- Before/after percentages are not reported when the build, device, data, or instrumentation conditions differ.

## Current native baseline limitation

The phase 2 development worktree did not have access to CoreSimulatorService or an ADB daemon in its sandbox. A pre-change Production Release cold-start median, native first frame, FPS/memory trace, and native screenshots could therefore not be captured here. These remain release-QA requirements and are not replaced by Vitest duration or build time.

## Calendar backend dependency

An uncached month spans six or seven week boards. Each existing week response carries daily completion meaning that the month UI must preserve. With the current frontend contract, reducing an uncached month to fewer requests would require omitting days, inventing completion state, or changing the meaning of cached data.

The frontend must not infer or merge a different contract. One of the following backend contracts is required:

1. A batch-weeks endpoint accepting the campus, season, and ordered week-start dates and returning the same validated week-board payload for every requested week.
2. A month-level daily-completion map keyed by local date, scoped by campus, user, season, and month, with an explicit timezone and invalidation/version contract.

The response must retain the existing authorization boundary and provide enough identity to reject stale campus, auth-generation, season, and month responses. Until such a contract exists, the six-to-seven request cold-month behavior is an explicit backend dependency rather than a frontend performance regression to conceal.
