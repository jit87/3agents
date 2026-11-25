# App Branding and Dark Mode

## Objective
Remove the remaining Next.js branding from the app chrome and add an accessible dark theme without changing workflow behavior.

## Problem and Why
The browser tab still uses the starter favicon, and the development indicator can show Next.js branding at the edge of the screen. The app also has no dark appearance, which the user requested before approving a commit.

## Scope
- Replace the starter favicon with a simple app-specific three-agent icon.
- Hide the Next.js development indicator while preserving compile/runtime error reporting.
- Add an accessible light/dark toggle, defaulting to the saved preference or system preference when available.
- Apply theme colors consistently to the page and controls; preserve the existing Spanish copy and synchronous request flow.

## Out of Scope
- Workflow/API changes, deployment, README changes, new dependencies, or redesign beyond the requested branding/theme updates.

## Constraints and Decisions
- Keep `cacheComponents` enabled.
- Use Next.js App Router icon conventions and the supported `devIndicators` option.
- TDD mode: standard mode (`strict_tdd: false`), previously confirmed for this project.
- Verification: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and a local UI smoke check where available.
- Implementation route: delegated direct; the icon, Next config, UI state, and styles span several files.
- Delivery strategy: `ask-on-risk`; estimated authored change below 400 lines. Use the user's session-level `stacked-to-main` preference if committing.

## Acceptance Criteria
- [x] The browser tab uses app-specific branding instead of the default Next.js favicon (`app/icon.svg`).
- [x] The Next.js development indicator is hidden; compile/runtime errors remain visible through normal error reporting.
- [x] A keyboard-accessible control switches between readable light and dark themes.
- [x] Theme preference persists across reloads; system preference is used before a user choice exists.
- [x] The existing synchronous workflow and all current Spanish UI behavior remain unchanged.
- [x] Tests, lint, TypeScript, and production build pass.

## Tasks
- [x] UI-1 (delegated): Replace starter branding and implement/test the dark theme.

## Progress and Evidence
- Implementation is complete on `feature/agent-workflow`; only the scoped branding/theme changes and this task document are modified.
- The starter `app/favicon.ico` was removed; `app/page.tsx` already uses the app's three-agent wordmark, so the edge logo was the Next.js dev indicator.
- Next.js 16.4 documentation confirms `app/icon.svg` can provide a custom icon and `devIndicators: false` hides the development indicator without suppressing compile/runtime errors.
- Verification: `npm test` passed (14/14); `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed. The independent verification run found no obvious UI or workflow regression.
- Work-unit commit: `b2326ad` (`feat(ui): remove Next branding and add dark mode`).
- The sandbox denied the first test invocation before execution; the same command was rerun with approval and passed. `git diff --check` emitted only expected LF-to-CRLF warnings.
- No browser-based visual smoke test was completed; production build and structural UI review passed.

## Next Step
Complete. No push or PR was requested.
