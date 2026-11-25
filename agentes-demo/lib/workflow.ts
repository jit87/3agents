import "server-only";
import { sql } from "@/lib/db";
import { callModel } from "@/lib/llm";
import {
  runWorkflow,
  type AgentRole,
  type WorkflowAgents,
  type WorkflowPlan,
  type WorkflowStore,
  type TestVerdict,
} from "@/lib/workflow-core";
import { buildAttemptHistory } from "@/lib/workflow-response";

type TaskRow = {
  id: string;
  agent: AgentRole;
  max_attempts: number;
  attempt_count: number;
};

const store: WorkflowStore = {
  async createRequest(prompt) {
    const rows = await sql`INSERT INTO requests (prompt) VALUES (${prompt}) RETURNING id`;
    return { id: rows[0].id as string };
  },
  async createTask(requestId, role) {
    const rows = await sql`
      INSERT INTO tasks (request_id, agent, title)
      VALUES (${requestId}, ${role}, ${`${role[0].toUpperCase()}${role.slice(1)} agent`})
      RETURNING id, agent, max_attempts, attempt_count
    ` as TaskRow[];
    return toAgentTask(rows[0]);
  },
  async setRequestStatus(requestId, status) {
    // Persist stage transitions so request state survives beyond this in-memory run.
    await sql`UPDATE requests SET status = ${status}, updated_at = NOW() WHERE id = ${requestId}`;
  },
  async beginTaskAttempt(taskId, input) {
    const serialized = JSON.stringify(input) ?? "null";
    // Enforce each role's persisted retry limit atomically in the database.
    const rows = await sql`
      UPDATE tasks
      SET status = 'running', attempt_count = attempt_count + 1, input = ${serialized}::jsonb,
          output = NULL, error = NULL, updated_at = NOW(), completed_at = NULL
      WHERE id = ${taskId} AND attempt_count < max_attempts
      RETURNING id
    `;
    return rows.length === 1;
  },
  async finishTask(taskId, output) {
    await sql`
      UPDATE tasks
      SET status = 'succeeded', output = ${(JSON.stringify(output) ?? "null")}::jsonb,
          error = NULL, updated_at = NOW(), completed_at = NOW()
      WHERE id = ${taskId}
    `;
  },
  async failTask(taskId, error, output) {
    const serialized = output === undefined ? null : JSON.stringify(output) ?? "null";
    await sql`
      UPDATE tasks SET status = 'failed', error = ${error}, output = COALESCE(${serialized}::jsonb, output),
        updated_at = NOW(), completed_at = NOW()
      WHERE id = ${taskId}
    `;
  },
  async addEvent({ requestId, taskId, actor, eventType, details = {} }) {
    await sql`
      INSERT INTO events (request_id, task_id, actor, event_type, details)
      VALUES (${requestId}, ${taskId ?? null}, ${actor}, ${eventType}, ${(JSON.stringify(details) ?? "null")}::jsonb)
    `;
  },
};

// Each role is a separate Gemini agent; callModel handles transport retries, while Testing verdicts drive workflow cycles.
const agents: WorkflowAgents = {
  async orchestrator(input) {
    return parseObject<WorkflowPlan>(await callModel([
      { role: "system", content: "You are the Orchestrator agent. Return JSON with a concise string `plan` and a non-empty string array `acceptanceCriteria`. On retries, use previous Testing feedback to revise the plan and criteria." },
      { role: "user", content: JSON.stringify(input) },
    ], { json: true }), isWorkflowPlan, "Orchestrator");
  },
  async develop(input) {
    const response = parseObject<{ result: string }>(await callModel([
      { role: "system", content: "You are the Develop agent. Return JSON with a string `result` containing the proposed solution. Follow the Orchestrator plan and explicitly address any previous Testing feedback." },
      { role: "user", content: JSON.stringify(input) },
    ], { json: true }), (value): value is { result: string } => isRecord(value) && typeof value.result === "string", "Develop");
    return response;
  },
  async testing(input) {
    return parseObject<TestVerdict>(await callModel([
      { role: "system", content: "You are the Testing agent, an evaluator only; do not claim to execute code or tests. Evaluate the Develop result against every acceptance criterion. Return JSON with boolean `passed` and string `feedback`; when failing, give actionable specific feedback for revision." },
      { role: "user", content: JSON.stringify(input) },
    ], { json: true }), isTestVerdict, "Testing");
  },
};

export function createWorkflow(prompt: string) {
  return runWorkflow(prompt, { store, agents }).then(async (result) => {
    const rows = await sql`
      SELECT e.event_type, e.actor, e.details, t.status AS task_status
      FROM events e LEFT JOIN tasks t ON t.id = e.task_id
      WHERE e.request_id = ${result.requestId}
      ORDER BY e.id ASC
    `;
    return { ...result, history: buildAttemptHistory(rows as Array<Record<string, unknown>>) };
  });
}

function toAgentTask(row: TaskRow) {
  if (!row) throw new Error("Database did not return the created task.");
  return { id: row.id, agent: row.agent, maxAttempts: row.max_attempts, attemptCount: row.attempt_count };
}

function parseObject<T>(content: string, validate: (value: unknown) => value is T, role: string): T {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`${role} returned invalid JSON.`);
  }
  if (!validate(value)) throw new Error(`${role} returned a response that did not match its required contract.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkflowPlan(value: unknown): value is WorkflowPlan {
  return isRecord(value)
    && typeof value.plan === "string"
    && Array.isArray(value.acceptanceCriteria)
    && value.acceptanceCriteria.length > 0
    && value.acceptanceCriteria.every((criterion) => typeof criterion === "string");
}

function isTestVerdict(value: unknown): value is TestVerdict {
  return isRecord(value) && typeof value.passed === "boolean" && typeof value.feedback === "string";
}
