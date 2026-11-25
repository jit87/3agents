# Equipo de 3 agentes de IA

Prueba técnica: aplicación **Next.js** en la que tres agentes de IA colaboran para resolver una petición. Los agentes son **Orchestrator**, **Develop** y **Testing**.

El estado de cada petición, tarea y evento se guarda en base de datos.

- **Aplicación publicada:** https://3agents.vercel.app
- **Autenticación:** no es necesaria; la aplicación es pública.

## Cómo funciona

Cada petición sigue este ciclo:

1. **Orchestrator** recibe la petición, la divide en tareas y define los criterios de aceptación.
2. **Develop** recibe ese plan y produce el resultado.
3. **Testing** evalúa el resultado de Develop frente a la petición y los criterios de aceptación, y devuelve un veredicto.

Si Testing aprueba, la petición termina como `completed`.

Si Testing detecta un fallo, sus observaciones pasan al siguiente ciclo:

**Orchestrator → Develop → Testing**

El número de intentos está limitado por `tasks.max_attempts` (3 por defecto). Si se agota el máximo, la petición termina como `failed`.

### Comunicación entre agentes

Los agentes no se llaman directamente entre sí. Se coordinan a través de la base de datos:

- Cada agente deja su salida y estado en `tasks`.
- El siguiente agente lee esa información.
- Cada paso del proceso queda registrado en `events`.

### Dos tipos de reintentos

**Reintentos técnicos — cliente Gemini**

Ante errores de red o respuestas `503`, el cliente reintenta con esperas de 1, 3 y 7 segundos y puede recurrir al modelo definido en `GEMINI_FALLBACK_MODEL`.

Estos reintentos no cuentan como intentos funcionales.

**Reintentos funcionales — equipo de agentes**

Se producen cuando Testing detecta un fallo:

**Develop → Testing → Orchestrator → Develop → Testing**

Los errores del proveedor de IA no se consideran fallos de Testing.

## Stack

- **Next.js** — App Router + TypeScript
- **Neon** — PostgreSQL
- **Gemini API** — mediante su endpoint compatible con el formato OpenAI
- **Vercel** — despliegue

## Ejecutar en local

La aplicación se encuentra en la subcarpeta `agentes-demo`.

### 1. Instalar dependencias

```bash
cd agentes-demo
npm install
```

### 2. Configurar las variables de entorno

Crea `.env.local` a partir del archivo de ejemplo:

```bash
cp .env.example .env.local
```

Rellena los valores correspondientes.

### 3. Crear las tablas

Ejecuta el contenido de `db/schema.sql` en el editor SQL de Neon.

### 4. Arrancar la aplicación

```bash
npm run dev
```

Después, abre http://localhost:3000.

## Variables de entorno

Los valores se configuran en `.env.local`, que está ignorado por Git. En producción se configuran como variables de entorno de Vercel.

**No subas claves al repositorio.**

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Cadena de conexión a Neon. |
| `GEMINI_API_KEY` | Clave de la API de Gemini. |
| `GEMINI_MODEL` | Modelo principal (opcional; existe un valor por defecto en el código). |
| `GEMINI_FALLBACK_MODEL` | Modelo alternativo si el principal falla (opcional). |
| `DAILY_REQUEST_LIMIT` | Límite de peticiones diarias (opcional). |

## Despliegue

La aplicación está desplegada en Vercel con la siguiente configuración:

- Proyecto de Vercel conectado al repositorio de GitHub.
- **Root Directory:** `agentes-demo`.
- Base de datos Neon creada mediante la integración de Vercel.
- `DATABASE_URL` proporcionada por la integración.
- El resto de variables configuradas en **Settings → Environment Variables** de Vercel.

## Pruebas

Para ejecutar las pruebas:

```bash
npm test
```

Las pruebas utilizan `node:test` y dobles de prueba, por lo que **no realizan llamadas reales a Gemini ni a Neon**.

Cubren:

- Aprobación en el primer intento.
- Reintento después de un fallo de Testing.
- Fallos consecutivos.
- Agotamiento del máximo de intentos.
- Estados finales `completed` y `failed`.
- Formato de las llamadas a Gemini, tanto de texto como de JSON.

### Última ejecución registrada

| Comprobación | Resultado |
|---|---|
| `npm test` | 14/14 aprobadas |
| `npm run lint` | Aprobado |
| `npx tsc --noEmit` | Aprobado |
| `npm run build` | Aprobado |

## Cómo usé Codex

### Herramienta

Programé la parte de agentes con **Codex** (línea de comandos), configurado con **gentle-ai**, que proporciona memoria persistente mediante Engram y hooks de sesión.

### Lo que preparé antes de usar Codex

Con ayuda de otro asistente de IA en un chat:

- Crear la aplicación Next.js y desplegarla en Vercel.
- Crear la base de datos en Neon y conectarla al proyecto.
- Crear la conexión inicial a la base de datos (`lib/db.ts`).
- Crear una ruta de comprobación (`/api/health`).

### Lo que escribió Codex

- La llamada a Gemini (`lib/llm.ts`), incluyendo los reintentos técnicos y el modelo alternativo.
- El esquema de base de datos (`db/schema.sql`).
- El flujo de los tres agentes.
- El endpoint `POST /api/requests`.
- Las pruebas.
- La interfaz que muestra el estado de cada agente.

### Lo que pedí y decidí

- Que los tres agentes fueran funcionales y colaborasen entre sí, en lugar de ser tres módulos independientes.
- Reutilizar el esquema existente de estados e intentos, sin crear otro sistema paralelo.
- Separar los reintentos técnicos de Gemini del bucle funcional `Develop → Testing`.
- Los casos de prueba que debían cubrirse.
- Comprobar que las llamadas a Gemini seguían funcionando.
- Que Codex no leyera ni mostrara claves.
- Que las pruebas no realizaran llamadas reales a Gemini.
- Cambiar de proveedor: inicialmente utilicé Groq, pero no pude acceder a su consola, por lo que finalmente utilicé Gemini.

### Lo que revisé

- Los archivos generados por Codex, especialmente `lib/llm.ts` y el esquema de base de datos.
- Que no hubiera claves en el repositorio ni en su historial, mediante `git grep` y `git log -S`.

## Decisiones y límites conocidos

### Interpretación de la prueba

El enunciado no especifica si los agentes deben utilizar un modelo de IA real. Interpreté que sí, ya que se solicitan claves de API y se mencionan planes gratuitos. Por ello utilicé Gemini.

Este punto no fue consultado previamente.

### Los agentes producen y evalúan texto

Develop devuelve un resultado en texto estructurado y Testing lo evalúa mediante el modelo frente a los criterios de aceptación.

**No se ejecuta código real generado por Develop.**

### Flujo síncrono

La interfaz espera a que termine todo el flujo. No hay colas ni procesamiento en segundo plano.

Un flujo especialmente largo podría acercarse al tiempo máximo de ejecución de las funciones de Vercel.

### Cupo gratuito de Gemini

El cupo gratuito de Gemini es limitado y puede responder con errores de saturación (`503`) o límite de uso (`429`).

Si se produce un error que no puede resolverse mediante los reintentos técnicos, la petición termina como `failed` y se muestra el mensaje correspondiente en la interfaz.

### Sin autenticación

La aplicación es pública y no requiere autenticación.

El límite diario, si está configurado mediante `DAILY_REQUEST_LIMIT`, permite controlar el consumo del cupo gratuito.

### Pruebas con dobles

Las pruebas automáticas no ejercitan las instancias reales de Gemini ni Neon.

El flujo completo con los servicios reales se comprobó manualmente.
