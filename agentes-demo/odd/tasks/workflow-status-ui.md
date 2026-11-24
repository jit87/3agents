# Workflow Status UI

## Objective
Replace the Next.js starter page with a simple interface that submits a workflow request and displays its final outcome using the existing synchronous API.

## Problem and Why
The three-agent workflow is implemented behind `POST /api/requests`, but the project still has the starter UI. The technical test needs a clear presentation of the terminal status, result or failure, attempts, and participating agent roles.

## Scope
- Build a focused request form and final-outcome view using the existing `POST /api/requests` response.
- Display `completed` or `failed`, result/error when returned, functional attempt count when available, and the Orchestrator → Develop → Testing handoff.
- Handle pending submission, API failure, empty input, and repeat submission without implying live persisted progress.
- Add proportionate tests for successful and failed outcomes; do not make live Gemini or database calls in deterministic tests.

## Out of Scope
- New status/read endpoints, polling, WebSockets, asynchronous or resumable processing, request history/dashboard, workflow logic changes, README work, and deployment changes.

## Constraints and Decisions
- Preserve the existing synchronous `POST /api/requests` flow and response contract.
- Avoid changing workflow semantics; only adjust the API adapter if strictly required for UI compatibility.
- UI copy is in neutral, professional Spanish, as explicitly requested by the user.
- TDD mode: standard mode (`strict_tdd: false`), previously confirmed by the user for this project.
- Existing test command: `npm test`; checks include focused ESLint and `npx tsc --noEmit`.
- Implementation route: delegated direct; the UI, styling, and focused tests form a multi-file change.
- Delivery strategy: `ask-on-risk`; final authored change is 436 lines (additions plus deletions, including task documentation). Reuse the user's session-level `stacked-to-main` chain strategy selected for the previous work unit.

## Acceptance Criteria
- [x] User can enter a non-empty request and submit it to the existing POST endpoint; all interface text is in Spanish.
- [x] After completion, the interface clearly shows the final `completed`/`failed` status and returned result/error.
- [x] Attempt count is shown when available, and the three agent roles and their order are clear.
- [x] Loading/error states are understandable without representing them as live agent progress.
- [x] Successful and failed response states are tested without live Gemini/DB calls where practical.
- [x] `npm test` (14/14), `npm run lint`, and `npx tsc --noEmit` pass.

## Tasks
- [x] UI-1 (delegated): Implement the synchronous final-outcome interface and focused verification, including the user's Spanish UI copy requirement.

## Progress and Evidence
- Read-only mapping confirmed `app/page.tsx` is the untouched Next.js starter, `POST /api/requests` awaits the workflow and returns terminal status/attempts/result-or-error, and no read/status endpoint exists.
- The existing backend persists per-role task states and events, but the POST response does not return per-agent logs; the UI should communicate the team handoff without inventing detailed agent outcomes.
- User explicitly chose final-outcome display only; no live progress, polling, WebSockets, async processing, or additional status endpoint.
- Implemented the request form and final-outcome display in `app/page.tsx`, responsive visual styling in `app/globals.css`, metadata in `app/layout.tsx`, and safe response normalization in `lib/workflow-response.ts`; tests cover completed, functional failure, and API error responses.
- `npm test` passed 14/14; `npm run lint` passed; `npx tsc --noEmit` passed. An independent verifier also reran `npm test` successfully. Parent spot-check `npm test` passed 14/14 after sandbox retry.
- Local page GET smoke check showed the heading, agent sequence, and request form; it did not call Gemini or Neon. No workflow/API logic or endpoint was changed.
- `npm run build` remains blocked by the pre-existing Next.js configuration combination: `next.config.ts` enables `cacheComponents`, while `app/api/requests/route.ts` declares the Node.js runtime. This task did not change either setting.
- Final authored diff totals 436 additions plus deletions across source, tests, and this task document. Reuse the user's previously selected `stacked-to-main` chain strategy; no PR or push is requested.
- User explicitly authorized the local commit after requesting the Spanish localization; no push or PR is requested.
- Localized page text, metadata, response fallbacks, and user-facing API validation/failure messages into neutral professional Spanish. The status badge shows both its Spanish label and exact persisted code (`completed`/`failed`).
- After localization, `npm test` passed 14/14, `npm run lint`, `npx tsc --noEmit`, and `git diff --check` all passed.

## Next Step
Implementation, Spanish localization, and checks are complete. Create the local work-unit commit using the user's selected `stacked-to-main` strategy and record its identity here. No push or PR is authorized.
