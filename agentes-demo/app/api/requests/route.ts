import { createWorkflow } from "@/lib/workflow";

export async function POST(request: Request) {
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

  try {
    const result = await createWorkflow(body.prompt.trim());
    return Response.json(result, { status: result.status === "completed" ? 200 : 502 });
  } catch (error) {
    console.error("Failed to run request workflow:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "No se pudo iniciar el flujo de trabajo." }, { status: 500 });
  }
}
