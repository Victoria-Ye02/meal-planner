import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/recipes/save/[recipeId]
 *
 * Unsaves a recipe: deletes the requesting user's `SavedRecipe` join row
 * for `recipeId`. The underlying `Recipe` row is intentionally left in
 * place — other users may have their own `SavedRecipe` pointing at the
 * same row, and it's part of this project's recipe history regardless.
 *
 * Scoped to `(userId, recipeId)` via `deleteMany`'s `where`, so a request
 * can only ever remove the *requesting* user's own save, never another
 * user's. `deleteMany` (rather than `delete` on the compound unique key)
 * makes this naturally idempotent: unsaving something that isn't saved
 * (already unsaved, wrong id, etc.) is a no-op 200, not a 404 — simpler
 * for the client than distinguishing "already unsaved" from "success".
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { recipeId } = await params;
  if (!recipeId) {
    return NextResponse.json({ error: "Missing recipeId." }, { status: 400 });
  }

  await prisma.savedRecipe.deleteMany({
    where: { userId, recipeId },
  });

  return new NextResponse(null, { status: 204 });
}
