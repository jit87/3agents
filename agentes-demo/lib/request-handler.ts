export type RequestHandlerDependencies = {
  countRecentRequests(): Promise<number>;
  createWorkflow(prompt: string): Promise<unknown>;
  dailyLimit?: number;
};

export async function handleCreateRequest(request: Request, dependencies: RequestHandlerDependencies) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo de la solicitud debe ser JSON válido." }, { status: 400 });
  }

  if (
    typeof body !== "object"
    || body === null
    || !("prompt" in body)
    || typeof body.prompt !== "string"
    || body.prompt.trim().length === 0
    || body.prompt.length > 10_000
  ) {
    return Response.json({ error: "La solicitud debe contener texto y no superar los 10.000 caracteres." }, { status: 400 });
  }

  const limit = dependencies.dailyLimit ?? parseDailyLimit(process.env.DAILY_REQUEST_LIMIT);
  try {
    if (await dependencies.countRecentRequests() >= limit) {
      return Response.json({ error: "Alcanzaste el límite diario de solicitudes. Inténtalo de nuevo más tarde." }, { status: 429 });
    }
  } catch {
    return Response.json({ error: "No se pudo procesar la solicitud. Inténtalo de nuevo más tarde." }, { status: 500 });
  }

  try {
    const result = await dependencies.createWorkflow(body.prompt.trim());
    const status = typeof result === "object" && result !== null && "status" in result && result.status === "completed" ? 200 : 502;
    return Response.json(result, { status });
  } catch {
    console.error("Failed to run request workflow.");
    return Response.json({ error: "No se pudo iniciar el flujo de trabajo." }, { status: 500 });
  }
}

function parseDailyLimit(value: string | undefined): number {
  if (!value) return 10;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
}
