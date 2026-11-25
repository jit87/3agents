import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const handlerUrl = pathToFileURL(`${process.env.WORKFLOW_TEST_BUILD_DIR}/lib/request-handler.js`);
const { handleCreateRequest } = (await import(handlerUrl)).default;

test("daily cap returns Spanish 429 before workflow creation", async () => {
  let workflowCalls = 0;
  const response = await handleCreateRequest(new Request("http://local/api/requests", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "work" }),
  }), {
    dailyLimit: 10,
    countRecentRequests: async () => 10,
    createWorkflow: async () => { workflowCalls += 1; return { status: "completed" }; },
  });
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /límite diario/i);
  assert.equal(workflowCalls, 0);
});
