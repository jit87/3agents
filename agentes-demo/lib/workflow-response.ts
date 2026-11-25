export type WorkflowResponse = {
  requestId?: string;
  status: "completed" | "failed";
  attempts?: number;
  result: string;
  error: string;
};

export type ParsedWorkflowResponse =
  | { kind: "outcome"; outcome: WorkflowResponse }
  | { kind: "error"; message: string };

export function parseWorkflowResponse(body: unknown): ParsedWorkflowResponse {
  if (!isRecord(body)) {
    return { kind: "error", message: "El servidor devolvió una respuesta inesperada. Inténtalo de nuevo." };
  }

  if (body.status === "completed" || body.status === "failed") {
    return {
      kind: "outcome",
      outcome: {
        status: body.status,
        requestId: typeof body.requestId === "string" ? body.requestId : undefined,
        attempts: typeof body.attempts === "number" && Number.isFinite(body.attempts) && body.attempts >= 0
          ? body.attempts
          : undefined,
        result: typeof body.result === "string" ? body.result : "El flujo no devolvió ningún resultado.",
        error: typeof body.error === "string" ? body.error : "El flujo terminó sin detalles adicionales sobre el fallo.",
      },
    };
  }

  return {
    kind: "error",
    message: typeof body.error === "string"
      ? body.error
      : "El servidor devolvió una respuesta inesperada. Inténtalo de nuevo.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
