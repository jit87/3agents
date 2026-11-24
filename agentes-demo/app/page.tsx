"use client";

import { FormEvent, useState } from "react";
import { parseWorkflowResponse, WorkflowResponse } from "@/lib/workflow-response";

const agents = [
  { name: "Orchestrator", description: "Define el plan y los criterios de aceptación." },
  { name: "Develop", description: "Desarrolla una solución a partir del plan." },
  { name: "Testing", description: "Evalúa el resultado según los criterios." },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<WorkflowResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setMessage("Escribe una solicitud antes de enviarla.");
      return;
    }

    setMessage("");
    setOutcome(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: normalizedPrompt }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = parseWorkflowResponse(body);

      if (parsed.kind === "outcome") {
        setOutcome(parsed.outcome);
      } else {
        setMessage(parsed.message);
      }
    } catch {
      setMessage("No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <header className="page-header">
          <div className="brand-mark" aria-hidden="true">3</div>
          <div>
            <p className="eyebrow">FLUJO DE IA</p>
            <h1>Tres agentes. Un resultado claro.</h1>
            <p className="intro">
              Envía una tarea y revisa el resultado cuando terminen Orchestrator, Develop y Testing.
            </p>
          </div>
        </header>

        <section className="workflow-card" aria-labelledby="workflow-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CÓMO FUNCIONA</p>
              <h2 id="workflow-heading">Un equipo coordinado, paso a paso</h2>
            </div>
          </div>
          <ol className="agent-flow">
            {agents.map((agent, index) => (
              <li className="agent-step" key={agent.name}>
                <span className="agent-number">0{index + 1}</span>
                <div>
                  <h3>{agent.name}</h3>
                  <p>{agent.description}</p>
                </div>
                {index < agents.length - 1 && <span className="step-arrow" aria-hidden="true">→</span>}
              </li>
            ))}
          </ol>
          <p className="workflow-note">
            Cada intento funcional sigue este orden. Testing evalúa el resultado de Develop; si detecta un problema, sus observaciones se tienen en cuenta en el siguiente intento.
          </p>
        </section>

        <section className="request-card" aria-labelledby="request-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NUEVA SOLICITUD</p>
              <h2 id="request-heading">¿En qué debería trabajar el equipo?</h2>
            </div>
            <span className="limit-label">Hasta 10.000 caracteres</span>
          </div>
          <form onSubmit={handleSubmit}>
            <label className="visually-hidden" htmlFor="prompt">Describe tu solicitud</label>
            <textarea
              id="prompt"
              name="prompt"
              rows={5}
              maxLength={10_000}
              placeholder="Describe la tarea o el resultado que necesitas…"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={isSubmitting}
            />
            <div className="form-footer">
              <p className="helper-text">El estado final y el resultado aparecerán cuando termine el flujo síncrono.</p>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Procesando…" : "Ejecutar flujo"}
              </button>
            </div>
          </form>

          {isSubmitting && (
            <p className="notice" role="status">Solicitud en curso. Esta vista se actualizará cuando el flujo devuelva el resultado final.</p>
          )}
          {message && <p className="notice notice-error" role="alert">{message}</p>}

          {outcome && (
            <section className={`outcome outcome-${outcome.status}`} aria-labelledby="outcome-heading" aria-live="polite">
              <div className="outcome-header">
                <div>
                  <p className="eyebrow">FLUJO FINALIZADO</p>
                  <h2 id="outcome-heading">{outcome.status === "completed" ? "Solicitud completada" : "Solicitud fallida"}</h2>
                </div>
                <span className={`status-badge status-${outcome.status}`}>
                  {outcome.status === "completed" ? "Completada" : "Fallida"} · {outcome.status}
                </span>
              </div>
              {outcome.requestId && <p className="request-id">ID de solicitud: <code>{outcome.requestId}</code></p>}
              {outcome.attempts !== undefined && (
                <p className="attempt-count">Intentos funcionales: <strong>{outcome.attempts}</strong></p>
              )}
              <div className="result-panel">
                <h3>{outcome.status === "completed" ? "Resultado" : "Qué ocurrió"}</h3>
                <p>{outcome.status === "completed" ? outcome.result : outcome.error}</p>
              </div>
            </section>
          )}
        </section>
        <footer className="page-footer">Un flujo síncrono con un ciclo acotado de revisión y mejora.</footer>
      </div>
    </main>
  );
}
