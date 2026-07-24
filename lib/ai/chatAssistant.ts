/**
 * Cooking assistant chat calls Claude models through OpenRouter's
 * OpenAI-compatible Chat Completions API — same provider/endpoint as
 * lib/ai/generateRecipes.ts (see tasks/plan.md's Architecture Decisions).
 * Kept as its own small module rather than sharing generateRecipes.ts's
 * function because the response shape is different: a free-text
 * conversational reply here, not a JSON-schema-validated recipe list.
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

export type AskAssistantResult =
  { success: true; reply: string } | { success: false; error: string };

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/**
 * Sends the system prompt (with the user's retrieved recipe/meal-plan data
 * already embedded) plus the full conversation so far to the configured AI
 * model, and returns its free-text reply.
 *
 * Never throws for expected failure modes (network/timeout, non-2xx
 * response, malformed/empty content) — those are all surfaced as
 * `{ success: false, error }` so callers don't need try/catch.
 */
export async function askAssistant({
  systemPrompt,
  messages,
}: {
  systemPrompt: string;
  messages: ChatMessage[];
}): Promise<AskAssistantResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "The cooking assistant is not configured (missing API key).",
    };
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

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
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
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

  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return {
      success: false,
      error: "The cooking assistant returned no reply.",
    };
  }

  return { success: true, reply: content.trim() };
}
