export type AgentRole = "orchestrator" | "develop" | "testing";

export type AgentTask = {
  id: string;
  agent: AgentRole;
  maxAttempts: number;
  attemptCount: number;
};

export type WorkflowPlan = {
  plan: string;
  acceptanceCriteria: string[];
};

export type TestVerdict = {
  passed: boolean;
  feedback: string;
};

export type WorkflowAgents = {
  orchestrator(input: { prompt: string; previousFeedback: string | null }): Promise<WorkflowPlan>;
  develop(input: WorkflowPlan & { prompt: string; previousFeedback: string | null }): Promise<{ result: string }>;
  testing(input: { prompt: string; development: { result: string }; acceptanceCriteria: string[] }): Promise<TestVerdict>;
};

export type WorkflowStore = {
  createRequest(prompt: string): Promise<{ id: string }>;
  createTask(requestId: string, role: AgentRole): Promise<AgentTask>;
  setRequestStatus(requestId: string, status: "orchestrating" | "developing" | "testing" | "completed" | "failed"): Promise<void>;
  beginTaskAttempt(taskId: string, input: unknown): Promise<boolean>;
  finishTask(taskId: string, output: unknown): Promise<void>;
  failTask(taskId: string, error: string, output?: unknown): Promise<void>;
  addEvent(event: { requestId: string; taskId?: string; actor: AgentRole | "system"; eventType: string; details?: unknown }): Promise<void>;
};

export type WorkflowResult = {
  requestId: string;
  status: "completed" | "failed";
  attempts: number;
  result?: string;
  error?: string;
};

export async function runWorkflow(
  prompt: string,
  dependencies: { store: WorkflowStore; agents: WorkflowAgents },
): Promise<WorkflowResult> {
  const { store, agents } = dependencies;
  const request = await store.createRequest(prompt);
  let activeTask: AgentTask | undefined;
  let previousFeedback: string | null = null;
  let latestResult: string | undefined;
  let attempts = 0;

  try {
    const taskSet = {
      orchestrator: await store.createTask(request.id, "orchestrator"),
      develop: await store.createTask(request.id, "develop"),
      testing: await store.createTask(request.id, "testing"),
    };
    // Use the smallest persisted role limit as the shared bound for complete agent cycles.
    const maxAttempts = Math.min(...Object.values(taskSet).map((task) => task.maxAttempts));
    await store.addEvent({ requestId: request.id, actor: "system", eventType: "workflow.started", details: { maxAttempts } });
    // Each cycle hands the Orchestrator plan to Develop, then sends Develop's result to Testing.
    while (attempts < maxAttempts) {
      attempts += 1;
      await store.setRequestStatus(request.id, "orchestrating");
      const orchestratorInput = { prompt, previousFeedback };
      activeTask = taskSet.orchestrator;
      await startTask(store, request.id, activeTask, orchestratorInput);
      const plan = await agents.orchestrator(orchestratorInput);
      await store.finishTask(activeTask.id, plan);
      activeTask = undefined;
      await store.addEvent({ requestId: request.id, taskId: taskSet.orchestrator.id, actor: "orchestrator", eventType: "agent.completed", details: { attempt: attempts, output: plan } });

      await store.setRequestStatus(request.id, "developing");
      // Develop receives the Orchestrator's plan and the last Testing feedback to revise rejected work.
      const developInput = { ...plan, prompt, previousFeedback };
      activeTask = taskSet.develop;
      await startTask(store, request.id, activeTask, developInput);
      const development = await agents.develop(developInput);
      latestResult = development.result;
      await store.finishTask(activeTask.id, development);
      activeTask = undefined;
      await store.addEvent({ requestId: request.id, taskId: taskSet.develop.id, actor: "develop", eventType: "agent.completed", details: { attempt: attempts, output: development } });

      await store.setRequestStatus(request.id, "testing");
      // Testing evaluates Develop's result against the original request and Orchestrator criteria.
      const testingInput = { prompt, development, acceptanceCriteria: plan.acceptanceCriteria };
      activeTask = taskSet.testing;
      await startTask(store, request.id, activeTask, testingInput);
      const verdict = await agents.testing(testingInput);
      if (verdict.passed) await store.finishTask(activeTask.id, verdict);
      else await store.failTask(activeTask.id, verdict.feedback || "Testing did not pass.", verdict);
      activeTask = undefined;
      await store.addEvent({ requestId: request.id, taskId: taskSet.testing.id, actor: "testing", eventType: verdict.passed ? "testing.passed" : "testing.failed", details: { attempt: attempts, feedback: verdict.feedback, output: verdict } });

      if (verdict.passed) {
        // Only a passing Testing verdict makes the request terminal-successful.
        await store.setRequestStatus(request.id, "completed");
        await store.addEvent({ requestId: request.id, actor: "system", eventType: "workflow.completed", details: { attempts } });
        return { requestId: request.id, status: "completed", attempts, result: latestResult };
      }

      // A Testing FAIL feeds the next functional cycle; Gemini transport retries stay inside callModel.
      previousFeedback = verdict.feedback;
      if (attempts < maxAttempts) {
        await store.addEvent({ requestId: request.id, actor: "system", eventType: "workflow.retry", details: { attempt: attempts, feedback: previousFeedback } });
      }
    }

    // Reaching this point means the persisted cycle budget was exhausted without a passing verdict.
    await store.setRequestStatus(request.id, "failed");
    const failureReason = previousFeedback ?? "No functional attempts are configured.";
    await store.addEvent({ requestId: request.id, actor: "system", eventType: "workflow.failed", details: { attempts, feedback: previousFeedback, error: failureReason } });
    return { requestId: request.id, status: "failed", attempts, error: failureReason };
  } catch (error) {
    // Provider or store exceptions fail operationally and never count as Testing FAIL retries.
    const message = error instanceof Error ? error.message : "Workflow failed unexpectedly.";
    if (activeTask) {
      try {
        await store.failTask(activeTask.id, message);
      } catch {
        // Preserve the original operation failure while making a best-effort task cleanup.
      }
    }
    try {
      await store.setRequestStatus(request.id, "failed");
    } catch {
      // A transient database error may prevent terminal-state cleanup; do not hide the cause.
    }
    try {
      await store.addEvent({ requestId: request.id, actor: "system", eventType: "workflow.failed", details: { attempts, error: message } });
    } catch {
      // Event persistence is best-effort when the store itself is failing.
    }
    return { requestId: request.id, status: "failed", attempts, error: message };
  }
}

async function startTask(store: WorkflowStore, requestId: string, task: AgentTask, input: unknown) {
  if (!(await store.beginTaskAttempt(task.id, input))) {
    throw new Error(`Task ${task.agent} has exhausted its persisted attempt limit.`);
  }
  await store.addEvent({ requestId, taskId: task.id, actor: task.agent, eventType: "agent.started", details: { input } });
}
