import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveRecipeRequestSchema } from "@/lib/validations/saveRecipe";

/**
 * POST /api/recipes/save
 *
 * Saves an AI-generated recipe to the current user's favorites.
 *
 * AI-generated recipes have no `Recipe` row until a user actually saves
 * one (see lib/ai/generateRecipes.ts's `Recipe` type — it has no `id`).
 * So the client sends the full recipe payload here, and this route
 * find-or-creates: it always creates a fresh `Recipe` row (aiGenerated:
 * true, createdBy: the current user) and then a `SavedRecipe` join row
 * pointing at it, inside one transaction so a failure can't leave an
 * orphaned `Recipe` with no save. De-duplicating identical recipe content
 * across saves/users is intentionally out of scope here — see task-8
 * brief; two `Recipe` rows for the same AI output is an acceptable
 * tradeoff for this task's scope.
 *
 * Returns the new `recipeId` so the client can track saved state per
 * card and pass it back to DELETE /api/recipes/save/[recipeId] to unsave.
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

  const parsed = saveRecipeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { title, ingredients, instructions } = parsed.data;

  const recipe = await prisma.$transaction(async (tx) => {
    const created = await tx.recipe.create({
      data: {
        title,
        ingredients,
        instructions,
        aiGenerated: true,
        createdBy: userId,
      },
    });

    await tx.savedRecipe.create({
      data: { userId, recipeId: created.id },
    });

    return created;
  });

  return NextResponse.json({ recipeId: recipe.id }, { status: 201 });
}
