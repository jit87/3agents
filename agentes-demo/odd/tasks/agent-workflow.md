# Agent Workflow

## Objective
Implement a persisted, functional Orchestrator → Develop → Testing workflow with explicit agent handoffs and a bounded functional retry loop.

## Problem and Why
The project currently stores workflow-shaped request/task states and attempt limits, and has a Gemini transport adapter, but no application workflow invokes three agents together. The user explicitly requested implementation and automated proof of the loop.

## Scope
- Add a server-side workflow API and orchestration service using the existing `requests`, `tasks`, and `events` schema.
- Implement three distinct Gemini agent contracts; pass each agent's structured output to the next, and pass Testing feedback through Orchestrator to Develop on another cycle.
- Count functional cycles using persisted `tasks.attempt_count` and `tasks.max_attempts`; terminal request status must be `completed` or `failed`.
- Add deterministic automated tests for successful first pass, one retry, multiple failures, max-attempt exhaustion, and terminal states.
- Preserve the existing Gemini transport retry/fallback behavior; do not alter API key configuration or expose credentials.

## Out of Scope
- User interface, Codex README, Vercel configuration/deployment, database schema redesign, external queue/background processing, and unrelated refactors.

## Constraints and Decisions
- TDD mode: standard mode (`strict_tdd: false`), explicitly confirmed by the user because no project mode was configured.
- Test runner: Node's built-in `node:test`, without adding dependencies, explicitly confirmed by the user.
- Test command: `npm test`, using Node's built-in runner and a no-dependency temp-compilation harness; checks also include `npx eslint ...` and `npx tsc --noEmit`.
- External provider requests are not part of deterministic unit tests; never read or print `.env.local` or API key values.
- Use the existing task attempt columns and request status values; no parallel retry counter or workflow state machine in the schema.
- Implementation route: delegated direct; mandatory because this is a multi-file, non-trivial workflow requiring preparation and tests.
- Forecast: approximately 540 authored added lines for implementation and test files, plus small package/task-doc edits; advisory estimate, not a cap. Delivery strategy: `ask-on-risk`.
- Chain strategy: `stacked-to-main`, selected by the user. No PR or push is requested; this task will produce a local work-unit commit only.

## Acceptance Criteria
- [x] `POST /api/requests` validates a prompt and starts the persisted workflow; invalid input returns a client error without creating workflow records. (Code-reviewed and typechecked; no route/Neon integration test run.)
- [x] Orchestrator, Develop, and Testing are distinct model roles whose structured outputs are persisted and passed through explicit handoffs.
- [x] Testing receives Develop's output and acceptance criteria; a passing verdict ends the request as `completed`.
- [x] A failing verdict is fed back through a new Orchestrator → Develop → Testing cycle.
- [x] Functional attempts are bounded by the existing persisted `max_attempts`; exhaustion ends as `failed` and does not launch another cycle.
- [x] Request/task state changes and per-cycle agent results are persisted with events; provider/API errors are not miscounted as Testing failures.
- [x] Tests cover first-pass success, retry after failure, consecutive failures, maximum attempts, and both terminal outcomes using deterministic fakes.
- [x] Existing plain-text and JSON Gemini call paths retain their request format and transport retry/fallback behavior; no API key values are changed or exposed.
- [x] `npm test` (11/11), focused ESLint (no errors/warnings), and `npx tsc --noEmit` pass.

## Tasks
- [ ] WF-1 (delegated): Implement agent contracts, persisted workflow loop, POST entry point, and deterministic tests together as one coherent work unit.

## Progress and Evidence
- Exploration found existing `db/schema.sql` request/task/event tables and `lib/llm.ts` Gemini adapter; no workflow code, test runner, or test suite exists.
- The schema defaults each task's `max_attempts` to 3 and constrains it to 0–3; the workflow must read and honor that value rather than hardcoding a parallel limit.
- Implemented `POST /api/requests`, a server-only workflow adapter, and deterministic workflow core. Per-role task input/output is persisted; each attempt's structured agent output is retained in `events.details`.
- The effective functional limit is the minimum `max_attempts` read from the three inserted task rows; SQL increments each task's `attempt_count` conditionally. Provider errors terminate the request instead of being translated into Testing FAIL.
- Independent audit correction: when the effective limit is zero, no role is invoked and all three task rows remain `pending` (the schema has no skipped status); the request is `failed` with `No functional attempts are configured.` This behavior is covered by the passing zero-limit test.
- Testing receives the original prompt, Develop output, and criteria. Testing FAIL is persisted on the failed Testing task and passed to the next Orchestrator and Develop inputs; successful Orchestrator/Develop tasks remain `succeeded` at exhaustion.
- Operational errors best-effort mark the active task and request failed; cleanup preserves the original error if the DB is also failing. Task creation failure after request creation also triggers request failure cleanup.
- Added a no-dependency `npm test` harness compiling the core and existing Gemini adapter into an OS temp directory with `--rootDir .`, running `.mjs` Node tests, then deleting temporary output. Added deterministic workflow and mock-fetch contract tests.
- Parent's first verification found and reported two harness issues (compiled output path and ESLint `no-require-imports` in CommonJS tests); both were corrected by setting `--rootDir .` and converting tests to ESM.
- Runtime/auth caveat: `POST /api/requests` explicitly uses the Node.js runtime, and neither the handler nor this project's current scope implements authentication/authorization; treat it as unauthenticated and protect it before public exposure.
- User confirmed the synchronous MVP is intentional for the technical test; no async/restartable processing will be added in this task.
- After these ESM corrections and the zero-attempt task-state correction, parent reran `npm test`: 11/11 passed; focused ESLint on the changed source/test files passed with no warnings; `npx tsc --noEmit` passed with no diagnostics. Commands first failed inside the sandbox with `EPERM: lstat 'C:\Users\jigna'`; rerun with approved access produced the results above.
- Parent used the existing environment configuration without printing or changing credentials to make two live Gemini smoke calls using the existing plain-text and JSON prompts; both succeeded. The deterministic Gemini tests remain mocked and do not require credentials.
- Not run: `next build` or a Neon-backed route integration test; workflow behavior is unit-tested with an injected store, and no database writes were made. The three real agent roles have not been run together end-to-end against Gemini and Neon.
- Independent review caveat: the POST handler awaits every agent call synchronously. With Gemini's existing per-model network retries and fallback, worst-case elapsed time may exceed serverless request-duration limits and leave rows in a running state if the host forcibly terminates execution. A durable async worker/queue is not implemented. The route also has no authentication/rate limiting; do not expose publicly without a gate.

## Next Step
Source implementation and final checks are complete for the synchronous technical-test scope. Create the required local work-unit commit using the user-selected `stacked-to-main` chain strategy; then record its commit identity here. No PR or push is requested.
