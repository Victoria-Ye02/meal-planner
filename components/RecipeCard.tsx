import type { Recipe } from "@/lib/ai/generateRecipes";

type RecipeCardProps = {
  recipe: Recipe;
  /** Whether this recipe is currently saved to the user's favorites. */
  saved: boolean;
  /** Invoked when the save/unsave button is clicked. */
  onToggleSave: () => void;
  /** True while a save or unsave request for this card is in flight. */
  isSaving?: boolean;
  /** Error message from the most recent failed save/unsave attempt, if any. */
  saveError?: string | null;
};

/**
 * Presentational card for a single AI-generated recipe: title,
 * ingredients, instructions, and a save/unsave toggle button. No data
 * fetching happens here — the save/unsave request and per-card state are
 * owned by the caller (GenerateForm); this component only renders the
 * current state and reports clicks via `onToggleSave`.
 */
export function RecipeCard({
  recipe,
  saved,
  onToggleSave,
  isSaving = false,
  saveError = null,
}: RecipeCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 shadow-sm dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
          {recipe.title}
        </h3>
        <button
          type="button"
          onClick={onToggleSave}
          disabled={isSaving}
          aria-pressed={saved}
          className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            saved
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          }`}
        >
          {isSaving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      {saveError && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {saveError}
        </p>
      )}

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
