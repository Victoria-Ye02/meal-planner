import { NextResponse } from "next/server";

import { assignRecipeToMealPlan } from "@/lib/ai/assignRecipeToMealPlan";
import { buildAssistantSystemPrompt } from "@/lib/ai/assistantPrompt";
import {
  ASSIGN_RECIPE_TOOL,
  ASSIGN_RECIPE_TOOL_NAME,
} from "@/lib/ai/assistantTools";
import { askAssistant, type RequestedToolCall } from "@/lib/ai/chatAssistant";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { findSimilarSavedRecipes } from "@/lib/ai/vectorSearch";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentWeekStartDate } from "@/lib/mealPlan";
import { releaseGenerationSlot, reserveGenerationSlot } from "@/lib/rateLimit";
import { assistantChatRequestSchema } from "@/lib/validations/assistant";
import { upsertMealPlanEntryRequestSchema } from "@/lib/validations/mealPlan";

/** How many saved recipes to retrieve via vector similarity search per message. */
const SIMILAR_RECIPES_LIMIT = 5;

/**
 * Parses and validates one requested tool call's raw JSON arguments.
 * `argumentsJson` comes from the model — untrusted input — so this goes
 * through the same Zod schema PUT /api/mealplan/[planId]/entries uses for
 * its own request body, not a bespoke/looser check.
 */
function parseToolCallArguments(call: RequestedToolCall) {
  let raw: unknown;
  try {
    raw = JSON.parse(call.argumentsJson);
  } catch {
    return { success: false as const, error: "Malformed tool call arguments." };
  }

  const parsed = upsertMealPlanEntryRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Invalid tool call arguments: " + parsed.error.message,
    };
  }

  return { success: true as const, data: parsed.data };
}

/**
 * POST /api/assistant
 *
 * Auth -> validate -> rate-limit -> retrieve the user's own data -> ask the
 * AI (with the meal-plan write tool available) -> if it requests a write,
 * validate + execute it server-side and get a final confirmation reply ->
 * return the reply (plus a structured mealPlanUpdate when a write happened).
 *
 * Write safety: the model is instructed (lib/ai/assistantPrompt.ts) to
 * only call assign_recipe_to_meal_plan after the user has explicitly
 * confirmed a suggestion in a prior turn — it must never auto-write on a
 * first ask. That's a prompting-level gate, not a hard guarantee, so this
 * route treats every tool call as untrusted regardless of what the prompt
 * asked for: assignRecipeToMealPlan() re-verifies the recipe actually
 * belongs to the requesting user (not just any valid recipe id the model
 * might produce), the tool's arguments are schema-validated before use,
 * and the tool has no planId/userId parameter at all — the route always
 * resolves "the current week's plan for the authenticated user" itself,
 * so nothing the model returns can target another user's data.
 *
 * Saved-recipe retrieval is vector search (pgvector, cosine distance via
 * lib/ai/vectorSearch.ts): the user's message is embedded, then the
 * `SIMILAR_RECIPES_LIMIT` closest saved recipes by embedding are fetched,
 * instead of the user's entire saved-recipe collection. If embedding the
 * query fails (embeddings API hiccup), this falls back to a direct fetch
 * of the user's saved recipes (capped at the same limit, newest first).
 *
 * Meal plan retrieval (for context, not the write) is unchanged from the
 * RAG-lite version: a direct fetch, not vector search.
 *
 * Rate limiting reuses `reserveGenerationSlot`/`releaseGenerationSlot` —
 * the same `AiGenerationLog`-backed daily cap Task 6's recipe-generation
 * endpoint uses. One shared quota per user across recipe generation and
 * every assistant message, including the follow-up call after a tool use
 * (still just one reserved slot per user-sent message, not one per model
 * round-trip).
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
    // page's stat row: `findFirst`, not `upsert`). The write tool, when
    // actually used, creates the plan itself via assignRecipeToMealPlan().
    prisma.mealPlan.findFirst({
      where: { userId, weekStartDate: getCurrentWeekStartDate(new Date()) },
      include: { entries: { include: { recipe: true } } },
    }),
    prisma.savedRecipe.count({ where: { userId } }),
  ]);

  const systemPrompt = buildAssistantSystemPrompt({
    savedRecipes: savedRecipes.map(
      ({ recipeId, title, ingredients, instructions }) => ({
        recipeId,
        title,
        ingredients,
        instructions,
      }),
    ),
    totalSavedRecipeCount,
    mealPlanEntries: (weekPlan?.entries ?? []).map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      mealType: entry.mealType,
      recipeTitle: entry.recipe.title,
    })),
  });

  const conversation = [
    ...history,
    { role: "user" as const, content: message },
  ];

  const firstResult = await askAssistant({
    systemPrompt,
    messages: conversation,
    tools: [ASSIGN_RECIPE_TOOL],
  });

  if (!firstResult.success) {
    if (rateLimit.logId) {
      await releaseGenerationSlot(rateLimit.logId);
    }
    return NextResponse.json({ error: firstResult.error }, { status: 502 });
  }

  const toolCall = firstResult.toolCalls.find(
    (call) => call.name === ASSIGN_RECIPE_TOOL_NAME,
  );

  if (!toolCall) {
    return NextResponse.json({ reply: firstResult.reply }, { status: 200 });
  }

  // The model requested the write tool. Validate its arguments and the
  // caller's ownership of the recipe before touching the database — see
  // the "Write safety" note in this file's top comment.
  const parsedArgs = parseToolCallArguments(toolCall);
  const assignResult = parsedArgs.success
    ? await assignRecipeToMealPlan({
        userId,
        recipeId: parsedArgs.data.recipeId,
        dayOfWeek: parsedArgs.data.dayOfWeek,
        mealType: parsedArgs.data.mealType,
      })
    : { success: false as const, error: parsedArgs.error };

  const toolResultContent = JSON.stringify(assignResult);

  const secondResult = await askAssistant({
    systemPrompt,
    messages: conversation,
    toolResult: { call: toolCall, resultContent: toolResultContent },
  });

  if (!secondResult.success) {
    if (rateLimit.logId) {
      await releaseGenerationSlot(rateLimit.logId);
    }
    return NextResponse.json({ error: secondResult.error }, { status: 502 });
  }

  return NextResponse.json(
    {
      reply: secondResult.reply,
      ...(assignResult.success
        ? {
            mealPlanUpdate: {
              recipeTitle: assignResult.recipeTitle,
              dayLabel: assignResult.dayLabel,
              mealType: assignResult.mealType,
            },
          }
        : {}),
    },
    { status: 200 },
  );
}
