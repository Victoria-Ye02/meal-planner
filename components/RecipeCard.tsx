import type { Recipe } from "@/lib/ai/generateRecipes";

type RecipeCardProps = {
  recipe: Recipe;
};

/**
 * Pure presentational card for a single AI-generated recipe: title,
 * ingredients, and instructions. No data fetching or save/favorite
 * behavior here — save/unsave lands in a later task.
 */
export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 shadow-sm dark:border-zinc-800">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
        {recipe.title}
      </h3>

      <div className="mt-3">
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Ingredients
        </h4>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={`${index}-${ingredient}`}>{ingredient}</li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Instructions
        </h4>
        <p className="mt-1 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
          {recipe.instructions}
        </p>
      </div>
    </div>
  );
}
