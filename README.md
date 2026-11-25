# Equipo de 3 agentes de IA

Prueba técnica: una aplicación Next.js en la que tres agentes de IA colaboran para resolver una petición. Los agentes son **Orchestrator**, **Develop** y **Testing**. El estado de cada petición, tarea y evento se guarda en base de datos.

- **App publicada:** https://3agents.vercel.app
- **Usuario y contraseña de prueba:** no hacen falta, la app es pública.

## Cómo funciona

Cada intento sigue este ciclo:

1. **Orchestrator** recibe la petición, la divide en tareas y define los criterios de aceptación.
2. **Develop** recibe ese plan y produce el resultado.
3. **Testing** evalúa el resultado de Develop frente a la petición y los criterios, y devuelve un veredicto.

Si Testing aprueba, la petición termina como `completed`. Si falla, sus observaciones pasan al siguiente ciclo (Orchestrator → Develop → Testing). El número de intentos está limitado por `tasks.max_attempts` (3 por defecto). Si se agota, la petición termina como `failed`.

Los agentes no se llaman directamente entre sí: se coordinan a través de la base de datos. Cada agente deja su salida y su estado en `tasks`, el siguiente la lee, y cada paso queda registrado en `events`.

### Dos tipos de reintentos

- **Reintentos técnicos** (cliente Gemini): ante errores de red o respuestas 503, el cliente reintenta con esperas de 1, 3 y 7 segundos y puede recurrir al modelo de `GEMINI_FALLBACK_MODEL`.
- **Reintentos funcionales** (equipo de agentes): el ciclo Develop → Testing cuando Testing detecta un fallo.

Los primeros no cuentan como intentos funcionales y los errores del proveedor no se tratan como un fallo de Testing.

## Stack

- Next.js (App Router, TypeScript)
- Neon (Postgres gratuito)
- Gemini API, a través de su endpoint compatible con el formato OpenAI
- Vercel (plan gratuito)

## Ejecutar en local

La aplicación está en la subcarpeta `agentes-demo`.

1. Instala las dependencias:
   ```bash
   cd agentes-demo
   npm install
   ```
2. Crea tu archivo de variables a partir del ejemplo y rellénalo (ver la sección siguiente):
   ```bash
   cp .env.example .env.local
   ```
3. Crea las tablas ejecutando el contenido de `db/schema.sql` en el editor SQL de Neon.
4. Arranca la app:
   ```bash
   npm run dev
   ```
5. Abre http://localhost:3000, escribe una petición y ejecuta el flujo.

## Variables de entorno

Solo se listan los nombres. Los valores van en `.env.local` (ignorado por Git) y, en producción, en las variables de entorno de Vercel. **No subas claves al repositorio.**

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a Neon. |
| `GEMINI_API_KEY` | Clave de la API de Gemini. |
| `GEMINI_MODEL` | Modelo principal (opcional; hay un valor por defecto en el código). |
| `GEMINI_FALLBACK_MODEL` | Modelo alternativo si el principal falla (opcional). |
| `DAILY_REQUEST_LIMIT` | Tope de peticiones por día (opcional). |

## Despliegue

- Proyecto en Vercel conectado al repositorio de GitHub, con **Root Directory** `agentes-demo`.
- Base de datos Neon creada desde la integración de Vercel, que inyecta `DATABASE_URL`.
- El resto de variables se añaden en **Settings → Environment Variables** de Vercel.

## Pruebas

```bash
npm test
```

Usan `node:test` sin dependencias adicionales y dobles de prueba: **no llaman a Gemini ni a Neon**. Cubren aprobación a la primera, reintento tras un fallo, fallos consecutivos, agotamiento del máximo de intentos y los dos estados finales. También cubren que las llamadas a Gemini (texto y JSON) mantienen su formato.

Última ejecución registrada:

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 14/14 aprobadas |
| `npm run lint` | Aprobado |
| `npx tsc --noEmit` | Aprobado |
| `npm run build` | Aprobado |

## Cómo usé Codex

**Herramienta.** Programé la parte de agentes con **Codex** (línea de comandos), que tengo configurado con **gentle-ai** (memoria persistente Engram y hooks de sesión).

**Lo que preparé yo antes de usar Codex**, con ayuda de otro asistente de IA en un chat:
- Crear la app Next.js y desplegarla en Vercel.
- Crear la base de datos en Neon y conectarla al proyecto.
- La conexión inicial a la base de datos (`lib/db.ts`) y una ruta de comprobación (`/api/health`).

**Lo que escribió Codex:**
- La llamada a Gemini (`lib/llm.ts`) con reintentos técnicos y modelo alternativo.
- El esquema de base de datos (`db/schema.sql`).
- El flujo de los tres agentes, el endpoint `POST /api/requests` y las pruebas.
- La interfaz que muestra el estado de cada agente.

**Lo que pedí y decidí yo:**
- Que los tres agentes fueran funcionales y se comunicaran, y no tres módulos independientes.
- Reutilizar el esquema de estados e intentos existente, sin crear otro sistema paralelo.
- Separar los reintentos técnicos de Gemini del bucle funcional Develop → Testing.
- Los casos de prueba que debían cubrirse y que se comprobara que las llamadas a Gemini seguían funcionando.
- Que Codex no leyera ni mostrara claves, y que las pruebas no llamaran a Gemini.
- Cambiar de proveedor: empecé por Groq, pero no pude acceder a su consola, así que usé Gemini.

**Lo que revisé yo:**
- Los archivos que generó Codex, en especial `lib/llm.ts` y el esquema.
- Que las claves no estuvieran en el repositorio ni en su historial (`git grep` y `git log -S`).

## Decisiones y límites conocidos

- **Interpretación de la prueba.** El enunciado no dice si los agentes deben usar un modelo real. Interpreté que sí (pide claves de API y planes gratuitos) y usé Gemini. No consulté este punto con vosotros.
- **Los agentes producen y evalúan texto.** Develop devuelve un resultado en texto estructurado y Testing lo evalúa con el modelo frente a los criterios. No se ejecuta código real.
- **Flujo síncrono.** La interfaz espera a que termine el flujo. No hay colas ni procesamiento en segundo plano, y un flujo largo podría acercarse al tiempo máximo de las funciones de Vercel.
- **Cupo gratuito de Gemini.** Es limitado y a veces responde con saturación (503) o límite de uso (429). Si ocurre, la petición queda como `failed` con un mensaje en la interfaz.
- **Sin autenticación.** La app es pública. El tope diario, si está activo, limita el gasto del cupo gratuito.
- **Pruebas con dobles.** Las pruebas automáticas no ejercitan Gemini ni Neon reales; el flujo completo se comprobó a mano.
