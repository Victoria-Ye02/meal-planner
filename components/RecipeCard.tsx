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
    <div className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-sm transition-shadow duration-200 ease-out-quart hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-foreground">
          {recipe.title}
        </h3>
        <button
          type="button"
          onClick={onToggleSave}
          disabled={isSaving}
          aria-pressed={saved}
          className={`inline-flex shrink-0 items-center gap-1 rounded-control border px-2.5 py-1 text-xs font-medium transition-colors duration-200 ease-out-quart disabled:cursor-not-allowed disabled:opacity-50 ${
            saved
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground hover:bg-surface-2"
          }`}
        >
          <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
          {isSaving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      {saveError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {saveError}
        </p>
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Ingredients
        </h4>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-foreground/90">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={`${index}-${ingredient}`}>{ingredient}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Instructions
        </h4>
        <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">
          {recipe.instructions}
        </p>
      </div>
    </div>
  );
}
