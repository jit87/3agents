import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const responseUrl = pathToFileURL(`${process.env.WORKFLOW_TEST_BUILD_DIR}/lib/workflow-response.js`);
const { parseWorkflowResponse } = (await import(responseUrl)).default;

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
    error: "El flujo terminó sin detalles adicionales sobre el fallo.",
  });
});

test("presents a functional Testing failure with its feedback and attempts", () => {
  const parsed = parseWorkflowResponse({
    requestId: "request-456",
    status: "failed",
    attempts: 3,
    error: "Testing found an unmet acceptance criterion.",
  });

  assert.equal(parsed.kind, "outcome");
  assert.equal(parsed.outcome.status, "failed");
  assert.equal(parsed.outcome.error, "Testing found an unmet acceptance criterion.");
  assert.equal(parsed.outcome.attempts, 3);
});

test("uses an API error message when the server cannot start the workflow", () => {
  assert.deepEqual(parseWorkflowResponse({ error: "No se pudo iniciar el flujo de trabajo." }), {
    kind: "error",
    message: "No se pudo iniciar el flujo de trabajo.",
  });
});
