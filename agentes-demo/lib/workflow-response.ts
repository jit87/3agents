export type WorkflowResponse = {
  requestId?: string;
  status: "completed" | "failed";
  attempts?: number;
  result: string;
  error: string;
  history?: AttemptSummary[];
};

export type AgentAttempt = { role: "orchestrator" | "develop" | "testing"; status: "running" | "completed" | "failed"; summary: string };
export type AttemptSummary = { attempt: number; agents: AgentAttempt[] };

export function buildAttemptHistory(events: Array<Record<string, unknown>>): AttemptSummary[] {
  const attempts = new Map<number, Map<AgentAttempt["role"], AgentAttempt>>();
  for (const event of events) {
    const details = isRecord(event.details) ? event.details : {};
    const role = isRole(event.actor) ? event.actor : null;
    const attempt = typeof details.attempt === "number" ? details.attempt : null;
    if (!role || attempt === null) continue;
    let agents = attempts.get(attempt);
    if (!agents) { agents = new Map(); attempts.set(attempt, agents); }
    const output = isRecord(details.output) ? details.output : {};
    const value = role === "orchestrator" ? output.plan : role === "develop" ? output.result
      : event.event_type === "testing.passed" ? "Evaluación superada." : details.feedback;
    let status: AgentAttempt["status"] = event.event_type === "agent.started" ? "running" : "completed";
    let summary = summarize(value);
    if (event.event_type === "testing.failed") status = "failed";
    if (event.event_type === "agent.started") summary = "En curso";
    if (status === "running" && event.task_status === "failed") {
      status = "failed";
      summary = "No se pudo completar este paso. Inténtalo de nuevo.";
    }
    agents.set(role, { role, status, summary });
  }
  return [...attempts.entries()].sort(([a], [b]) => a - b).map(([attempt, agents]) => ({
    attempt,
    agents: (["orchestrator", "develop", "testing"] as const).map((role): AgentAttempt => agents.get(role) ?? { role, status: "running", summary: "Pendiente" }),
  }));
}

function summarize(value: unknown): string {
  if (typeof value === "string") return value.trim().slice(0, 240) || "Sin resumen disponible.";
  if (value === undefined || value === null) return "Sin resumen disponible.";
  return JSON.stringify(value).slice(0, 240);
}

export type ParsedWorkflowResponse =
  | { kind: "outcome"; outcome: WorkflowResponse }
  | { kind: "error"; message: string };

export function parseWorkflowResponse(body: unknown): ParsedWorkflowResponse {
  if (!isRecord(body)) {
    return { kind: "error", message: "El servidor devolvió una respuesta inesperada. Inténtalo de nuevo." };
  }

  if (body.status === "completed" || body.status === "failed") {
    const history = parseHistory(body.history);
    const rawError = typeof body.error === "string" ? body.error : "";
    const testingFailure = history?.some((attempt) => attempt.agents.some((agent) => agent.role === "testing" && agent.status === "failed"));
    return {
      kind: "outcome",
      outcome: {
        status: body.status,
        requestId: typeof body.requestId === "string" ? body.requestId : undefined,
        attempts: typeof body.attempts === "number" && Number.isFinite(body.attempts) && body.attempts >= 0
          ? body.attempts
          : undefined,
        result: typeof body.result === "string" ? body.result : "El flujo no devolvió ningún resultado.",
        error: testingFailure && rawError
          ? rawError.slice(0, 240)
          : body.status === "failed" ? "No se pudo completar el flujo. Revisa el historial de intentos e inténtalo de nuevo." : "",
        history,
      },
    };
  }

  return {
    kind: "error",
    message: typeof body.error === "string"
      ? sanitizeMessage(body.error)
      : "El servidor devolvió una respuesta inesperada. Inténtalo de nuevo.",
  };
}

function sanitizeMessage(value: string): string {
  if (value === "El cuerpo de la solicitud debe ser JSON válido."
    || value === "La solicitud debe contener texto y no superar los 10.000 caracteres."
    || value.includes("límite diario")) return value;
  return "No se pudo procesar la solicitud. Inténtalo de nuevo más tarde.";
}

function parseHistory(value: unknown): AttemptSummary[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.attempt !== "number" || !Array.isArray(item.agents)) return [];
    const agents = item.agents.flatMap((agent) => {
      if (!isRecord(agent) || !isRole(agent.role) || !isStatus(agent.status)) return [];
      return [{ role: agent.role, status: agent.status, summary: typeof agent.summary === "string" ? agent.summary.slice(0, 240) : "" }];
    });
    return [{ attempt: item.attempt, agents }];
  });
}

function isRole(value: unknown): value is AgentAttempt["role"] {
  return value === "orchestrator" || value === "develop" || value === "testing";
}
function isStatus(value: unknown): value is AgentAttempt["status"] {
  return value === "running" || value === "completed" || value === "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
