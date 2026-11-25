# Flujo de trabajo con tres agentes

Aplicación de prueba técnica que ejecuta, en orden, a **Orchestrator → Develop → Testing** y presenta el resultado final. El flujo es síncrono: la interfaz espera la respuesta de `POST /api/requests`; no hay progreso en tiempo real, polling ni procesamiento en segundo plano.

## Ejecutar localmente

1. Instala las dependencias si todavía no están instaladas:

   ```bash
   npm install
   ```

2. Configura en `.env.local` las credenciales existentes de Gemini y Neon. **No compartas ese archivo ni subas sus valores al repositorio.**
3. Inicia Next.js:

   ```bash
   npm run dev
   ```

4. Abre [http://localhost:3000](http://localhost:3000), escribe una solicitud y selecciona **Ejecutar flujo**. Al finalizar, la página muestra el estado, el resultado o error y los intentos funcionales realizados. Si el puerto 3000 está ocupado, usa el puerto que indique Next.js.

## Cómo colaboran los agentes

Cada intento funcional sigue este ciclo:

1. **Orchestrator** prepara un plan y criterios de aceptación.
2. **Develop** recibe ese plan y produce el resultado.
3. **Testing** evalúa el resultado frente a la solicitud y los criterios.

Si Testing falla, sus observaciones se pasan al siguiente ciclo. El máximo común se calcula con el menor valor persistido de `tasks.max_attempts` para los tres roles; al aprobar, la solicitud termina como `completed`, y al agotar intentos, como `failed`. Los estados y resultados se persisten.

Los reintentos técnicos del cliente Gemini son distintos: ante errores de red o respuestas 429/503, el cliente reintenta con esperas de 1, 3 y 7 segundos y después puede recurrir al modelo indicado por `GEMINI_FALLBACK_MODEL`. Esos reintentos no aumentan los intentos funcionales de Testing. Los detalles técnicos van al log; la respuesta al usuario es genérica.

## Cómo se usó Codex

Codex se usó para explorar el código existente, implementar cambios acotados y ejecutar verificaciones. Las decisiones de alcance y aceptación fueron humanas.

### Lo que pediste

- Investigar el 405 de `/api/llm-test`: la ruta es POST-only porque ejecuta llamadas a Gemini y no existía una llamada de frontend que corregir; no añadir GET como parche.
- Separar los reintentos técnicos de Gemini del bucle funcional Orchestrator → Develop → Testing.
- Implementar los tres agentes con handoffs reales, feedback entre intentos, límite persistido y estados terminales, reutilizando el esquema existente.
- Mantener el procesamiento síncrono y mostrar en la UI el estado final, el resultado y los intentos, sin polling ni endpoints de consulta nuevos.
- Corregir la compilación manteniendo `cacheComponents` habilitado.

### Qué pediste y qué revisaste tú

- Revisaste el alcance contra la prueba técnica y pediste que Orchestrator, Develop y Testing fueran agentes diferenciados, con feedback real entre intentos y un máximo persistido.
- Confirmaste que el flujo síncrono es suficiente; no autorizaste colas, reanudación, polling ni progreso en vivo.
- Definiste los casos que Codex debía verificar: aprobación inicial, reintento, fallos consecutivos, agotamiento del máximo y estados finales.
- Pediste separar los reintentos técnicos de Gemini de los fallos funcionales de Testing y proteger las claves.
- Solicitaste comentarios breves solo para explicar contratos y decisiones no evidentes, y que la interfaz estuviera en español.
- Pediste una revisión final de coherencia y que se repitieran las verificaciones automatizadas; sus resultados están resumidos abajo.

Esto documenta las decisiones y el alcance que revisaste en la conversación, por separado de las comprobaciones ejecutadas por Codex. **No afirma una revisión línea por línea ni que hayas ejecutado personalmente todos los checks.** La prueba manual completa en el navegador sigue pendiente y puedes hacerla con los pasos anteriores.

## Verificación automatizada

En las últimas verificaciones registradas:

| Comando o comprobación | Resultado |
| --- | --- |
| `npm test` | 14/14 pruebas aprobadas; cubre handoffs, reintentos y agotamiento con dependencias simuladas, contratos Gemini de texto/JSON y presentación de respuestas exitosas y fallidas. |
| `npm run lint` | Aprobado. |
| `npx tsc --noEmit` | Aprobado. |
| `npm run build` | Aprobado tras eliminar el `runtime` explícito incompatible con Cache Components. |
| `POST /api/requests` con `{}` | Respondió 400 con el error de validación esperado; no llamó a Gemini ni escribió en Neon. |

Las pruebas automatizadas no ejecutan los tres agentes reales contra Gemini y Neon. La comprobación de la ruta con una solicitud válida queda para la prueba manual local.

## Estado y límites conocidos

- El endpoint de solicitudes no implementa autenticación ni límite de uso; protégelo antes de exponerlo públicamente.
- No se ha confirmado un despliegue actual en Vercel. Los commits de este trabajo quedaron locales; no se hizo push ni despliegue.
- `.env.local` contiene configuración privada y no debe añadirse al repositorio.
