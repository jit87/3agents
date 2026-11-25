# Agent Attempt UI, Daily Request Limit, and Gemini 429 Fallback

## Objective
Show persisted per-attempt agent outcomes, enforce the configured rolling 24-hour request cap before workflow creation, and route Gemini 429 responses directly to the fallback model.

## Scope
- Read task/event history for the completed synchronous request and present per-attempt status/output summaries for Orchestrator, Develop, and Testing.
- Return a clear Spanish 429 before creating any records or calling Gemini once the rolling 24-hour cap is reached.
- On Gemini HTTP 429, skip retries of the primary model and use the configured fallback model if present.
- Keep the database schema and synchronous workflow unchanged; add focused tests with mocked model/database dependencies.

## Out of Scope
- README changes, timeout/logging changes, Vercel function duration settings, async processing, deployment, and schema changes.

## Constraints and Decisions
- Do not read or display `.env.local` or environment values.
- Keep operational/provider details out of user-visible errors; use concise Spanish messages.
- Route: delegated direct; changes span client, route, workflow response, UI, and tests.
- TDD mode: standard (`strict_tdd: false`); run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` once at the end.
- Delivery strategy: `ask-on-risk`; no push or deployment.

## Acceptance Criteria
- [ ] Each functional attempt shows all three agents, state, and concise output summary sourced from persisted tasks/events; errors are understandable and sanitized.
- [ ] A request beyond the rolling 24-hour limit returns Spanish HTTP 429 before workflow rows or Gemini calls are created.
- [ ] HTTP 429 from the primary Gemini model immediately uses fallback without retrying primary; 503/network retry behavior remains unchanged.
- [ ] Focused tests cover fallback order and daily cap short-circuit without real Gemini.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Tasks
- [x] AGENT-UI: Build per-attempt activity response from persisted task/event history and render it in the synchronous UI.
- [x] REQUEST-CAP: Enforce rolling 24-hour request limit before workflow start.
- [x] GEMINI-429: Route primary model 429 directly to configured fallback.

## Progress and Evidence
- Current branch: `feature/agent-workflow`.
- Pre-existing unrelated user change: `agentes-demo/AGENTS.md`; preserve it.
- Mapping found one task row per role is reused, while ordered events preserve prior attempt outputs. Added attempt numbers to `agent.started`; latest task state identifies an incomplete final attempt.
- Implemented per-attempt summaries from persisted events, added attempt numbers to `agent.started`, and rendered Orchestrator/Develop/Testing states and summaries in the synchronous UI.
- Added the rolling 24-hour request count before workflow creation with `DAILY_REQUEST_LIMIT` defaulting to 10; the cap returns a Spanish 429 before request/task/event creation or model calls.
- Gemini HTTP 429 now skips remaining retry budget for that model and advances immediately to the configured fallback. 503 and network retry handling were left unchanged.
- Added focused mocked test cases for daily-cap short-circuit, primary-429 fallback order, and persisted event history parsing. Tests were not executed per the delegated task instructions; parent verification is pending.
- No schema changes, `.env.local` access, real Gemini calls, README edits, push, or commit.

## Next Step
Parent runs the four requested checks once at the end, reviews and commits the work unit. No push.
