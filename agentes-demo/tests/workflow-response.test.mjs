import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const responseUrl = pathToFileURL(`${process.env.WORKFLOW_TEST_BUILD_DIR}/lib/workflow-response.js`);
const { parseWorkflowResponse, buildAttemptHistory } = (await import(responseUrl)).default;

test("presents a successful workflow response with its result and attempt count", () => {
  const parsed = parseWorkflowResponse({
    requestId: "request-123",
    status: "completed",
    attempts: 1,
    result: "The requested work is complete.",
  });

  assert.equal(parsed.kind, "outcome");
  assert.deepEqual(parsed.outcome, {
    requestId: "request-123",
    status: "completed",
    attempts: 1,
    result: "The requested work is complete.",
    error: "",
    history: undefined,
  });
});

test("presents a functional Testing failure with its feedback and attempts", () => {
  const parsed = parseWorkflowResponse({
    requestId: "request-456",
    status: "failed",
    attempts: 3,
    error: "Testing found an unmet acceptance criterion.",
    history: undefined,
  });

  assert.equal(parsed.kind, "outcome");
  assert.equal(parsed.outcome.status, "failed");
  assert.equal(parsed.outcome.error, "Testing found an unmet acceptance criterion.");
  assert.equal(parsed.outcome.attempts, 3);
});

test("builds ordered per-attempt agent summaries from persisted events", () => {
  const history = buildAttemptHistory([
    { actor: "orchestrator", event_type: "agent.started", details: { attempt: 1 } },
    { actor: "orchestrator", event_type: "agent.completed", details: { attempt: 1, output: { plan: "Plan one" } } },
    { actor: "develop", event_type: "agent.started", details: { attempt: 1 } },
    { actor: "develop", event_type: "agent.completed", details: { attempt: 1, output: { result: "Result one" } } },
    { actor: "testing", event_type: "agent.started", details: { attempt: 1 } },
    { actor: "testing", event_type: "testing.failed", details: { attempt: 1, feedback: "Revise this" } },
    { actor: "orchestrator", event_type: "agent.started", details: { attempt: 2 } },
  ]);
  assert.deepEqual(history.map((attempt) => attempt.attempt), [1, 2]);
  assert.deepEqual(history[0].agents.map(({ status, summary }) => [status, summary]), [
    ["completed", "Plan one"], ["completed", "Result one"], ["failed", "Revise this"],
  ]);
  assert.equal(history[1].agents[0].summary, "En curso");
  assert.equal(history[1].agents[1].summary, "Pendiente");
});

test("sanitizes unexpected API errors", () => {
  assert.deepEqual(parseWorkflowResponse({ error: "database password leaked" }), {
    kind: "error",
    message: "No se pudo procesar la solicitud. Inténtalo de nuevo más tarde.",
  });
});
