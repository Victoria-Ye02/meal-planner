import { NextResponse } from "next/server";

import { askAssistant } from "@/lib/ai/chatAssistant";
import { buildAssistantSystemPrompt } from "@/lib/ai/assistantPrompt";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentWeekStartDate } from "@/lib/mealPlan";
import { releaseGenerationSlot, reserveGenerationSlot } from "@/lib/rateLimit";
import { assistantChatRequestSchema } from "@/lib/validations/assistant";

/**
 * POST /api/assistant
 *
 * Auth -> validate -> rate-limit -> retrieve the user's own data -> ask the
 * AI -> return its reply. No vector search: the user's saved recipes and
 * current week's meal plan are small enough (a personal cookbook, not a
 * public corpus) that a direct Prisma fetch on every message is simpler
 * and sufficient — see tasks/plan.md for this scope decision.
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

  const [savedRecipeRows, weekPlan] = await Promise.all([
    prisma.savedRecipe.findMany({
      where: { userId },
      include: { recipe: true },
      orderBy: { savedAt: "desc" },
    }),
    // Read-only lookup — never creates a MealPlan row as a side effect of
    // asking the assistant a question (same principle as the Generate
    // page's stat row: `findFirst`, not `upsert`).
    prisma.mealPlan.findFirst({
      where: { userId, weekStartDate: getCurrentWeekStartDate(new Date()) },
      include: { entries: { include: { recipe: true } } },
    }),
  ]);

  const systemPrompt = buildAssistantSystemPrompt({
    savedRecipes: savedRecipeRows.map(({ recipe }) => ({
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
    })),
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
