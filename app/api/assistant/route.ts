import { NextResponse } from "next/server";

import { askAssistant } from "@/lib/ai/chatAssistant";
import { buildAssistantSystemPrompt } from "@/lib/ai/assistantPrompt";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { findSimilarSavedRecipes } from "@/lib/ai/vectorSearch";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentWeekStartDate } from "@/lib/mealPlan";
import { releaseGenerationSlot, reserveGenerationSlot } from "@/lib/rateLimit";
import { assistantChatRequestSchema } from "@/lib/validations/assistant";

/** How many saved recipes to retrieve via vector similarity search per message. */
const SIMILAR_RECIPES_LIMIT = 5;

/**
 * POST /api/assistant
 *
 * Auth -> validate -> rate-limit -> retrieve the user's own data -> ask the
 * AI -> return its reply.
 *
 * Saved-recipe retrieval is vector search (pgvector, cosine distance via
 * lib/ai/vectorSearch.ts): the user's message is embedded, then the
 * `SIMILAR_RECIPES_LIMIT` closest saved recipes by embedding are fetched,
 * instead of the user's entire saved-recipe collection. If embedding the
 * query fails (embeddings API hiccup), this falls back to a direct fetch
 * of the user's saved recipes (capped at the same limit, newest first) so
 * one degraded dependency doesn't take the whole assistant down — vector
 * search is a retrieval-quality enhancement, not a hard requirement for
 * the feature to function.
 *
 * Meal plan retrieval is unchanged from the RAG-lite version: a direct
 * fetch, not vector search — at most 21 slots for one week, no benefit to
 * embedding-based retrieval at that size, and it's always fully relevant
 * context regardless of what the user asked.
 *
 * Rate limiting reuses `reserveGenerationSlot`/`releaseGenerationSlot` —
 * the same `AiGenerationLog`-backed daily cap Task 6's recipe-generation
 * endpoint uses. This is a deliberate reuse, not an oversight: adding a
 * second, assistant-only counter would need its own schema, and this
 * feature is scoped to add none. Assistant messages and recipe generations
 * therefore share one daily quota per user.
 *
 * Chat history is never persisted: the client resends the whole
 * conversation-so-far with every message, and this handler is otherwise
 * stateless per request.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = assistantChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const rateLimit = await reserveGenerationSlot(userId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Daily AI usage limit reached (${rateLimit.limit}/day, shared with recipe generation). Please try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  const { message, history } = parsed.data;

  const queryEmbeddingResult = await generateEmbedding(message);

  const [savedRecipes, weekPlan, totalSavedRecipeCount] = await Promise.all([
    queryEmbeddingResult.success
      ? findSimilarSavedRecipes({
          userId,
          queryEmbedding: queryEmbeddingResult.embedding,
          limit: SIMILAR_RECIPES_LIMIT,
        })
      : // Fallback: embedding the query failed, so fall back to a direct
        // fetch (same shape as the original RAG-lite retrieval) capped at
        // the same limit, rather than surfacing no saved recipes at all.
        prisma.savedRecipe
          .findMany({
            where: { userId },
            include: { recipe: true },
            orderBy: { savedAt: "desc" },
            take: SIMILAR_RECIPES_LIMIT,
          })
          .then((rows) =>
            rows.map(({ recipe }) => ({
              recipeId: recipe.id,
              title: recipe.title,
              ingredients: recipe.ingredients,
              instructions: recipe.instructions,
            })),
          ),
    // Read-only lookup — never creates a MealPlan row as a side effect of
    // asking the assistant a question (same principle as the Generate
    // page's stat row: `findFirst`, not `upsert`).
    prisma.mealPlan.findFirst({
      where: { userId, weekStartDate: getCurrentWeekStartDate(new Date()) },
      include: { entries: { include: { recipe: true } } },
    }),
    prisma.savedRecipe.count({ where: { userId } }),
  ]);

  const systemPrompt = buildAssistantSystemPrompt({
    savedRecipes: savedRecipes.map(({ title, ingredients, instructions }) => ({
      title,
      ingredients,
      instructions,
    })),
    totalSavedRecipeCount,
    mealPlanEntries: (weekPlan?.entries ?? []).map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      mealType: entry.mealType,
      recipeTitle: entry.recipe.title,
    })),
  });

  const result = await askAssistant({
    systemPrompt,
    messages: [...history, { role: "user", content: message }],
  });

  if (!result.success) {
    // Roll back the reservation so a failed/misconfigured attempt doesn't
    // burn the user's shared daily quota.
    if (rateLimit.logId) {
      await releaseGenerationSlot(rateLimit.logId);
    }
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ reply: result.reply }, { status: 200 });
}
