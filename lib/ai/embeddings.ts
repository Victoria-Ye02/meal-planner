/**
 * Generates text embeddings via OpenRouter's `/v1/embeddings` endpoint
 * using `text-embedding-3-small` (1536 dimensions) — same OpenRouter API
 * key as lib/ai/generateRecipes.ts and lib/ai/chatAssistant.ts, no new
 * credential. Confirmed live against the real OpenRouter API (not assumed)
 * before building the pgvector column/migration around it.
 *
 * OPENROUTER_API_KEY must be set in the server environment. It is read
 * from process.env at call time and must never be logged or included in
 * any error message returned to callers.
 */

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

const REQUEST_TIMEOUT_MS = 15_000;

export type GenerateEmbeddingResult =
  { success: true; embedding: number[] } | { success: false; error: string };

interface OpenRouterEmbeddingsResponse {
  data?: Array<{ embedding?: number[] }>;
}

/**
 * Computes the embedding vector for a piece of text (typically a recipe's
 * title + ingredients + instructions concatenated). Never throws for
 * expected failure modes — surfaced as `{ success: false, error }`.
 */
export async function generateEmbedding(
  text: string,
): Promise<GenerateEmbeddingResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "Embedding generation is not configured (missing API key).",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      error: isAbort
        ? "Embedding generation timed out. Please try again."
        : "Failed to reach the embedding service. Please try again.",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      success: false,
      error: `Embedding service returned an error (status ${response.status}).`,
    };
  }

  let payload: OpenRouterEmbeddingsResponse;
  try {
    payload = await response.json();
  } catch {
    return {
      success: false,
      error: "Embedding service returned an unreadable response.",
    };
  }

  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    return {
      success: false,
      error: "Embedding service returned an unexpected response shape.",
    };
  }

  return { success: true, embedding };
}
