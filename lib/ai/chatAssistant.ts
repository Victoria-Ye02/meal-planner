/**
 * Cooking assistant chat calls Claude models through OpenRouter's
 * OpenAI-compatible Chat Completions API — same provider/endpoint as
 * lib/ai/generateRecipes.ts (see tasks/plan.md's Architecture Decisions).
 * Kept as its own small module rather than sharing generateRecipes.ts's
 * function because the response shape is different: a free-text
 * conversational reply here, not a JSON-schema-validated recipe list.
 *
 * Also supports OpenAI-compatible tool/function calling (verified live
 * against OpenRouter + Claude before this was built — see
 * app/api/assistant/route.ts's write-tool integration), used for the
 * assistant's meal-plan write capability.
 *
 * OPENROUTER_API_KEY must be set in the server environment. It is read
 * from process.env at call time and must never be logged or included in
 * any error message returned to callers.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/** Fetch timeout so a hung request never hangs the caller forever. */
const REQUEST_TIMEOUT_MS = 20_000;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** OpenAI-compatible tool/function definition, as OpenRouter expects it. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** A tool call the model requested, in a shape callers can act on directly. */
export interface RequestedToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments exactly as the model returned them — untrusted, parse and validate before use. */
  argumentsJson: string;
}

export type AskAssistantResult =
  | { success: true; reply: string; toolCalls: RequestedToolCall[] }
  | { success: false; error: string };

interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
}

/**
 * Sends the system prompt (with the user's retrieved recipe/meal-plan data
 * already embedded) plus the conversation so far to the configured AI
 * model, and returns either its free-text reply or the tool call(s) it
 * wants to make.
 *
 * `toolResult`, when provided, appends the prior assistant tool-call turn
 * plus a tool-result turn before this call — the standard OpenAI-compatible
 * pattern for completing a tool round-trip: call once, execute the tool
 * server-side, call again with the result so the model can produce a final
 * natural-language reply referencing what actually happened.
 *
 * Never throws for expected failure modes (network/timeout, non-2xx
 * response, malformed/empty content) — those are all surfaced as
 * `{ success: false, error }` so callers don't need try/catch.
 */
export async function askAssistant({
  systemPrompt,
  messages,
  tools,
  toolResult,
}: {
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolResult?: { call: RequestedToolCall; resultContent: string };
}): Promise<AskAssistantResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "The cooking assistant is not configured (missing API key).",
    };
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const rawMessages: unknown[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  if (toolResult) {
    rawMessages.push(
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: toolResult.call.id,
            type: "function",
            function: {
              name: toolResult.call.name,
              arguments: toolResult.call.argumentsJson,
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: toolResult.call.id,
        content: toolResult.resultContent,
      },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: rawMessages,
        ...(tools ? { tools } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      error: isAbort
        ? "The cooking assistant timed out. Please try again."
        : "Failed to reach the cooking assistant. Please try again.",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      success: false,
      error: `The cooking assistant returned an error (status ${response.status}).`,
    };
  }

  let payload: OpenRouterChatCompletionResponse;
  try {
    payload = await response.json();
  } catch {
    return {
      success: false,
      error: "The cooking assistant returned an unreadable response.",
    };
  }

  const message = payload.choices?.[0]?.message;
  const rawToolCalls = message?.tool_calls;

  if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
    return {
      success: true,
      reply: "",
      toolCalls: rawToolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        argumentsJson: call.function.arguments,
      })),
    };
  }

  const content = message?.content;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return {
      success: false,
      error: "The cooking assistant returned no reply.",
    };
  }

  return { success: true, reply: content.trim(), toolCalls: [] };
}
