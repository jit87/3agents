import "server-only";

const GEMINI_CHAT_COMPLETIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000] as const;

class NonRetryableResponseError extends Error {}

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CallModelOptions = {
  json?: boolean;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function callModel(
  messages: ModelMessage[],
  { json = false }: CallModelOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Gemini API configuration error: GEMINI_API_KEY is not set.");
    throw new Error("AI service is not configured.");
  }

  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL;
  // Each model gets its own transient-failure retry budget before fallback.
  const models = fallbackModel && fallbackModel !== primaryModel
    ? [primaryModel, fallbackModel]
    : [primaryModel];
  let response: Response | undefined;

  for (const model of models) {
    response = await fetchWithRetries(model, messages, json, apiKey);
    if (response) break;
    console.error("Gemini model exhausted retry attempts:", { model });
  }

  if (!response) {
    throw new Error("AI service request failed. Please try again.");
  }

  let data: ChatCompletionResponse;
  try {
    data = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown parse error";
    console.error("Gemini API returned invalid JSON:", detail);
    throw new Error("AI service returned an invalid response. Please try again.");
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error(
      "Gemini API response did not contain message text:",
      data.error?.message ?? "No error details provided",
    );
    throw new Error("AI service returned an invalid response. Please try again.");
  }

  return content;
}

async function fetchWithRetries(
  model: string,
  messages: ModelMessage[],
  json: boolean,
  apiKey: string,
): Promise<Response | undefined> {
  // Undefined means all retryable attempts failed, allowing the caller to try another model.
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(GEMINI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (response.ok) return response;
      if (response.status !== 429 && response.status !== 503) {
        let detail = "No error details provided";
        try {
          detail = (await response.text()).slice(0, 1000) || detail;
        } catch {
          detail = "Could not read the error response body";
        }
        console.error("Gemini API returned an unsuccessful response:", {
          model,
          status: response.status,
          statusText: response.statusText,
          detail,
        });
        throw new NonRetryableResponseError();
      }

      let detail = "No error details provided";
      try {
        detail = (await response.text()).slice(0, 1000) || detail;
      } catch {
        detail = "Could not read the error response body";
      }
      console.error("Gemini API returned a retryable response:", {
        model,
        status: response.status,
        statusText: response.statusText,
        detail,
        attempt: attempt + 1,
      });
    } catch (error) {
      if (error instanceof NonRetryableResponseError) {
        throw new Error("AI service request failed. Please try again.");
      }
      const detail = error instanceof Error ? error.message : "Unknown network error";
      console.error("Gemini API network request failed:", { model, attempt: attempt + 1, detail });
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  return undefined;
}
