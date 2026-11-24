import { createWorkflow } from "@/lib/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object"
    || body === null
    || !("prompt" in body)
    || typeof body.prompt !== "string"
    || body.prompt.trim().length === 0
    || body.prompt.length > 10_000
  ) {
    return Response.json({ error: "Prompt must be a non-empty string of at most 10000 characters." }, { status: 400 });
  }

  try {
    const result = await createWorkflow(body.prompt.trim());
    return Response.json(result, { status: result.status === "completed" ? 200 : 502 });
  } catch (error) {
    console.error("Failed to run request workflow:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "The workflow could not be started." }, { status: 500 });
  }
}
