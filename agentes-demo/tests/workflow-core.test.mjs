import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const coreUrl = pathToFileURL(`${process.env.WORKFLOW_TEST_BUILD_DIR}/lib/workflow-core.js`);
const { runWorkflow } = (await import(coreUrl)).default;

function fixture(verdicts, maxAttempts = 3) {
  const store = createStore(maxAttempts);
  const calls = [];
  const agents = {
    orchestrator: async (input) => {
      calls.push({ role: "orchestrator", input });
      return { plan: `plan-${calls.filter((call) => call.role === "orchestrator").length}`, acceptanceCriteria: ["works"] };
    },
    develop: async (input) => {
      calls.push({ role: "develop", input });
      return { result: `result-${calls.filter((call) => call.role === "develop").length}` };
    },
    testing: async (input) => {
      calls.push({ role: "testing", input });
      return verdicts.shift();
    },
  };
  return { store, calls, agents };
}

function createStore(maxAttempts) {
  let sequence = 0;
  const tasks = {};
  const request = { id: "request-1", status: "pending" };
  return {
    request,
    tasks,
    events: [],
    async createRequest() { return request; },
    async createTask(_requestId, agent) {
      const task = { id: `task-${agent}`, agent, maxAttempts: typeof maxAttempts === "number" ? maxAttempts : maxAttempts[agent] ?? 3, attemptCount: 0, input: null, output: null, status: "pending" };
      tasks[agent] = task;
      return task;
    },
    async setRequestStatus(_requestId, status) { request.status = status; },
    async beginTaskAttempt(id, input) {
      const task = Object.values(tasks).find((candidate) => candidate.id === id);
      if (task.attemptCount >= task.maxAttempts) return false;
      task.attemptCount += 1;
      task.input = input;
      task.status = "running";
      return true;
    },
    async finishTask(id, output) {
      const task = Object.values(tasks).find((candidate) => candidate.id === id);
      task.output = output;
      task.status = "succeeded";
    },
    async failTask(id, error, output) {
      const task = Object.values(tasks).find((candidate) => candidate.id === id);
      task.error = error;
      if (output !== undefined) task.output = output;
      task.status = "failed";
    },
    async addEvent(event) { this.events.push({ ...event, sequence: ++sequence }); },
  };
}

test("passes the persisted Orchestrator→Develop→Testing handoffs on the first attempt", async () => {
  const { store, calls, agents } = fixture([{ passed: true, feedback: "" }]);
  const result = await runWorkflow("build a thing", { store, agents });
  assert.equal(result.status, "completed");
  assert.deepEqual(calls.map(({ role }) => role), ["orchestrator", "develop", "testing"]);
  assert.deepEqual(calls[0].input, { prompt: "build a thing", previousFeedback: null });
  assert.deepEqual(calls[1].input, { plan: "plan-1", acceptanceCriteria: ["works"], prompt: "build a thing", previousFeedback: null });
  assert.deepEqual(calls[2].input, { prompt: "build a thing", development: { result: "result-1" }, acceptanceCriteria: ["works"] });
  assert.equal(store.request.status, "completed");
  assert.equal(store.tasks.orchestrator.status, "succeeded");
  assert.equal(store.tasks.develop.status, "succeeded");
  assert.equal(store.tasks.testing.status, "succeeded");
  assert.deepEqual(store.tasks.develop.input, calls[1].input);
  assert.deepEqual(store.tasks.testing.input, calls[2].input);
  assert.deepEqual(store.events.find((event) => event.eventType === "agent.completed").details.output, { plan: "plan-1", acceptanceCriteria: ["works"] });
});

test("feeds failed Testing feedback through Orchestrator into the next Develop attempt", async () => {
  const { store, calls, agents } = fixture([
    { passed: false, feedback: "handle empty input" },
    { passed: true, feedback: "" },
  ]);
  const result = await runWorkflow("build a thing", { store, agents });
  assert.equal(result.status, "completed");
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[3].input, { prompt: "build a thing", previousFeedback: "handle empty input" });
  assert.deepEqual(calls[4].input, { plan: "plan-2", acceptanceCriteria: ["works"], prompt: "build a thing", previousFeedback: "handle empty input" });
  assert.equal(calls[5].input.prompt, "build a thing");
  assert.deepEqual(calls[5].input.development, { result: "result-2" });
  assert.equal(store.tasks.testing.attemptCount, 2);
  assert.equal(store.tasks.testing.status, "succeeded");
});

test("carries each consecutive test failure into the next orchestration cycle", async () => {
  const { calls, agents } = fixture([
    { passed: false, feedback: "issue A" },
    { passed: false, feedback: "issue B" },
    { passed: true, feedback: "" },
  ]);
  const result = await runWorkflow("prompt", { store: createStore(3), agents });
  assert.equal(result.status, "completed");
  assert.equal(calls.filter((call) => call.role === "orchestrator").length, 3);
  assert.equal(calls[6].input.previousFeedback, "issue B");
});

test("stops at the minimum persisted role limit and preserves accurate terminal task states", async () => {
  const { store, calls, agents } = fixture([
    { passed: false, feedback: "first" },
    { passed: false, feedback: "second" },
  ], 2);
  const result = await runWorkflow("prompt", { store, agents });
  assert.equal(result.status, "failed");
  assert.equal(store.tasks.testing.attemptCount, 2);
  assert.equal(calls.length, 6);
  assert.equal(store.request.status, "failed");
  assert.equal(store.tasks.orchestrator.status, "succeeded");
  assert.equal(store.tasks.develop.status, "succeeded");
  assert.equal(store.tasks.testing.status, "failed");
});

test("persists provider errors as workflow failure, not a Testing FAIL verdict", async () => {
  const { store, calls, agents } = fixture([]);
  agents.develop = async () => { throw new Error("provider unavailable"); };
  const result = await runWorkflow("prompt", { store, agents });
  assert.equal(result.status, "failed");
  assert.equal(calls.length, 1);
  assert.equal(store.tasks.testing.attemptCount, 0);
  assert.equal(store.request.status, "failed");
  assert.equal(store.tasks.develop.status, "failed");
  assert.equal(store.tasks.orchestrator.status, "succeeded");
});

test("respects the smallest per-role persisted max even when task rows differ", async () => {
  const { store, calls, agents } = fixture([{ passed: false, feedback: "failed" }, { passed: true, feedback: "" }], {
    orchestrator: 3,
    develop: 1,
    testing: 3,
  });
  const result = await runWorkflow("prompt", { store, agents });
  assert.equal(result.status, "failed");
  assert.equal(store.tasks.testing.attemptCount, 1);
  assert.equal(store.tasks.develop.attemptCount, 1);
  assert.equal(calls.length, 3);
});

test("marks only the active role failed when a later agent operation errors", async () => {
  const { store, calls, agents } = fixture([]);
  agents.testing = async (input) => {
    calls.push({ role: "testing", input });
    throw new Error("Testing provider unavailable");
  };
  const result = await runWorkflow("prompt", { store, agents });
  assert.equal(result.status, "failed");
  assert.equal(store.tasks.orchestrator.status, "succeeded");
  assert.equal(store.tasks.develop.status, "succeeded");
  assert.equal(store.tasks.testing.status, "failed");
  assert.equal(store.tasks.testing.error, "Testing provider unavailable");
  assert.equal(store.request.status, "failed");
});

test("marks the request failed if task creation fails after request creation", async () => {
  const { store, calls, agents } = fixture([]);
  const createTask = store.createTask;
  store.createTask = async (requestId, role) => {
    if (role === "develop") throw new Error("database unavailable");
    return createTask(requestId, role);
  };
  const result = await runWorkflow("prompt", { store, agents });
  assert.equal(result.status, "failed");
  assert.equal(store.request.status, "failed");
  assert.equal(calls.length, 0);
});

test("fails without invoking agents when the persisted max attempt count is zero", async () => {
  const { store, calls, agents } = fixture([], 0);
  const result = await runWorkflow("prompt", { store, agents });
  assert.equal(result.status, "failed");
  assert.equal(result.attempts, 0);
  assert.equal(calls.length, 0);
  assert.equal(result.error, "No functional attempts are configured.");
  assert.equal(store.tasks.testing.status, "pending");
  assert.equal(store.tasks.orchestrator.status, "pending");
  assert.equal(store.tasks.develop.status, "pending");
  assert.deepEqual(Object.values(store.tasks).map((task) => task.attemptCount), [0, 0, 0]);
});
