import { z } from "zod";

import { buildRecipePrompt, type RecipePromptInput } from "./promptTemplate";

/**
 * Recipe generation calls Claude models through OpenRouter's
 * OpenAI-compatible Chat Completions API (NOT Anthropic's native API).
 * This is a deliberate architecture decision — see tasks/plan.md
 * "Architecture Decisions" and .superpowers/sdd/global-constraints.md.
 *
 * OPENROUTER_API_KEY must be set in the server environment. It is read
 * from process.env at call time and must never be logged or included in
 * any error message returned to callers.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Claude model id, in OpenRouter's `anthropic/<model-name>` slug format.
 * Overridable via OPENROUTER_MODEL for easy upgrades without a code change.
 */
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/** Fetch timeout so a hung request never hangs the caller forever. */
const REQUEST_TIMEOUT_MS = 20_000;

export interface Recipe {
  title: string;
  ingredients: string[];
  instructions: string;
}

export type GenerateRecipesResult =
  { success: true; recipes: Recipe[] } | { success: false; error: string };

const recipeSchema = z.object({
  title: z.string().min(1, "Recipe title must not be empty."),
  ingredients: z
    .array(z.string().min(1))
    .min(1, "Recipe must list at least one ingredient."),
  instructions: z.string().min(1, "Recipe instructions must not be empty."),
});

const recipeResponseSchema = z.object({
  recipes: z
    .array(recipeSchema)
    .min(1, "Response must contain at least one recipe."),
});

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/**
 * Strips optional markdown code fences (```json ... ``` or ``` ... ```)
 * that a model might wrap its JSON output in, despite being instructed
 * not to. Defensive-only; does not affect well-formed plain JSON.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * Calls the configured AI model (via OpenRouter) with a constrained,
 * data-delimited prompt and returns typed, validated recipes.
 *
 * Never throws for expected failure modes (network/timeout, non-2xx
 * response, malformed JSON, schema validation failure) — those are all
 * surfaced as `{ success: false, error }` so callers don't need try/catch.
 */
export async function generateRecipes(
  input: RecipePromptInput,
): Promise<GenerateRecipesResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "AI recipe generation is not configured (missing API key).",
    };
  }

  const { system, user } = buildRecipePrompt(input);
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
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      error: isAbort
        ? "AI recipe generation timed out. Please try again."
        : "Failed to reach the AI recipe generation service. Please try again.",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      success: false,
      error: `AI recipe generation service returned an error (status ${response.status}).`,
    };
  }

  let payload: OpenRouterChatCompletionResponse;
  try {
    payload = await response.json();
  } catch {
    return {
      success: false,
      error: "AI recipe generation service returned an unreadable response.",
    };
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    return {
      success: false,
      error: "AI recipe generation service returned no content.",
    };
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(stripCodeFences(content));
  } catch {
    return {
      success: false,
      error: "AI recipe generation service returned malformed JSON.",
    };
  }

  const validation = recipeResponseSchema.safeParse(parsedContent);
  if (!validation.success) {
    return {
      success: false,
      error:
        "AI recipe generation service returned an unexpected response shape.",
    };
  }

  return { success: true, recipes: validation.data.recipes };
}
