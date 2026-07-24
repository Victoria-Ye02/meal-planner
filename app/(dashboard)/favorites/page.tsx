import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { FavoritesList, type FavoriteRecipe } from "./FavoritesList";

export default async function FavoritesPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  // Scoped to the current user via `where: { userId }` — this must never
  // become a global recipe listing. `include: { recipe: true }` pulls in
  // the joined `Recipe` row for each save; newest-saved first so the most
  // recently favorited recipe appears at the top.
  const savedRecipes = await prisma.savedRecipe.findMany({
    where: { userId },
    include: { recipe: true },
    orderBy: { savedAt: "desc" },
  });

  const favorites: FavoriteRecipe[] = savedRecipes.map(({ recipe }) => ({
    id: recipe.id,
    title: recipe.title,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
  }));

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-12 sm:py-16">
      <div className="w-full max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Your favorites
        </h1>
        <p className="mb-8 text-muted">
          Recipes you&apos;ve saved, newest first.
        </p>
        <FavoritesList initialFavorites={favorites} />
      </div>
    </div>
  );
}
