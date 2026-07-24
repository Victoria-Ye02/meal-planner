"use client";

import { useState, type FormEvent } from "react";

import { IngredientInput } from "@/components/IngredientInput";
import { RecipeCard } from "@/components/RecipeCard";
import type { Recipe } from "@/lib/ai/generateRecipes";

const DIETARY_PREFERENCE_OPTIONS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "keto",
  "low-carb",
] as const;

type GenerateFormData = {
  ingredients: string[];
  dietaryPreferences: string[];
};

/**
 * Narrow, structural runtime checks for the `{ recipes: Recipe[] }` success
 * body returned by POST /api/recipes/generate. The route already validates
 * this shape server-side (Task 6); this is defense-in-depth on the client
 * so a malformed/unexpected body degrades to an error state instead of
 * crashing the render.
 */
function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    Array.isArray(candidate.ingredients) &&
    candidate.ingredients.every((entry) => typeof entry === "string") &&
    typeof candidate.instructions === "string"
  );
}

function isRecipesResponse(value: unknown): value is { recipes: Recipe[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.recipes) && candidate.recipes.every(isRecipe);
}

/** Narrow runtime check for the `{ recipeId: string }` body POST /api/recipes/save returns. */
function isSaveResponse(value: unknown): value is { recipeId: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.recipeId === "string" && candidate.recipeId.length > 0
  );
}

/**
 * Per-card save state, keyed by the recipe's index in the current
 * `recipes` array (recipes have no id of their own until saved — see
 * `Recipe` in lib/ai/generateRecipes.ts — so the array index is the
 * stable handle for the duration of one generation result).
 */
type SaveState = {
  recipeId: string | null;
  saved: boolean;
  isSaving: boolean;
  error: string | null;
};

const DEFAULT_SAVE_STATE: SaveState = {
  recipeId: null,
  saved: false,
  isSaving: false,
  error: null,
};

/** Extracts a human-readable error message from a JSON error body, if present. */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

/**
 * Collects ingredients and dietary preferences, submits them to
 * POST /api/recipes/generate, and renders the result: a loading indicator
 * while the request is in flight, a retryable error state if it fails, or
 * a grid of RecipeCards on success.
 */
export function GenerateForm() {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});

  function handleAddIngredient(ingredient: string) {
    setIngredients((current) => [...current, ingredient]);
    setValidationError(null);
  }

  function handleRemoveIngredient(ingredient: string) {
    setIngredients((current) =>
      current.filter((existing) => existing !== ingredient),
    );
  }

  function toggleDietaryPreference(preference: string) {
    setDietaryPreferences((current) =>
      current.includes(preference)
        ? current.filter((existing) => existing !== preference)
        : [...current, preference],
    );
  }

  async function submitGeneration() {
    setRequestError(null);
    setIsSubmitting(true);

    const formData: GenerateFormData = { ingredients, dietaryPreferences };

    try {
      const response = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Failed to generate recipes. Please try again.";
        setRequestError(message);
        return;
      }

      if (!isRecipesResponse(body)) {
        setRequestError(
          "Received an unexpected response from the server. Please try again.",
        );
        return;
      }

      setRecipes(body.recipes);
      // A fresh set of results has no relationship to the previous one's
      // save state (different recipes, different indices) — start clean.
      setSaveStates({});
    } catch {
      setRequestError("Failed to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Toggles save/unsave for the recipe at `index`. Saving POSTs the full
   * recipe payload to /api/recipes/save (the recipe has no id yet — it's
   * only ever existed as AI output in the browser — so the server
   * find-or-creates a `Recipe` row and hands back its id). Unsaving DELETEs
   * /api/recipes/save/[recipeId] using the id captured from that save.
   * Errors surface inline on the card rather than failing silently, so a
   * failed save never looks like it succeeded.
   */
  async function handleToggleSave(index: number, recipe: Recipe) {
    const state = saveStates[index] ?? DEFAULT_SAVE_STATE;

    setSaveStates((current) => ({
      ...current,
      [index]: { ...state, isSaving: true, error: null },
    }));

    try {
      if (state.saved && state.recipeId) {
        const response = await fetch(`/api/recipes/save/${state.recipeId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to unsave recipe. Please try again.");
        }

        setSaveStates((current) => ({
          ...current,
          [index]: { ...DEFAULT_SAVE_STATE },
        }));
        return;
      }

      const response = await fetch("/api/recipes/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          extractErrorMessage(body, "Failed to save recipe. Please try again."),
        );
      }
      if (!isSaveResponse(body)) {
        throw new Error(
          "Received an unexpected response from the server. Please try again.",
        );
      }

      setSaveStates((current) => ({
        ...current,
        [index]: {
          recipeId: body.recipeId,
          saved: true,
          isSaving: false,
          error: null,
        },
      }));
    } catch (err) {
      setSaveStates((current) => ({
        ...current,
        [index]: {
          ...state,
          isSaving: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to reach the server. Please try again.",
        },
      }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ingredients.length === 0) {
      setValidationError("Add at least one ingredient to generate recipes.");
      return;
    }

    setValidationError(null);
    setRecipes(null);
    await submitGeneration();
  }

  function handleRetry() {
    void submitGeneration();
  }

  const canSubmit = ingredients.length > 0;

  return (
    <div className="flex w-full flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-lg flex-col gap-6"
      >
        <IngredientInput
          ingredients={ingredients}
          onAdd={handleAddIngredient}
          onRemove={handleRemoveIngredient}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">
            Dietary preferences (optional)
          </legend>
          <div className="flex flex-wrap gap-2">
            {DIETARY_PREFERENCE_OPTIONS.map((preference) => {
              const isSelected = dietaryPreferences.includes(preference);
              return (
                <button
                  key={preference}
                  type="button"
                  onClick={() => toggleDietaryPreference(preference)}
                  aria-pressed={isSelected}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-200 ease-out-quart ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground hover:bg-surface-2"
                  }`}
                >
                  {preference}
                </button>
              );
            })}
          </div>
        </fieldset>

        {validationError && (
          <p role="alert" className="text-sm text-danger">
            {validationError}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          className="inline-flex items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Generating…" : "Generate recipes"}
        </button>
      </form>

      {isSubmitting && (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-muted"
        >
          <svg
            className="h-5 w-5 animate-spin text-primary"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Generating recipes, this can take a few seconds…</span>
        </div>
      )}

      {requestError && !isSubmitting && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
        >
          <p>{requestError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-control border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors duration-200 ease-out-quart hover:bg-danger/10"
          >
            Try again
          </button>
        </div>
      )}

      {recipes && recipes.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, index) => {
            const state = saveStates[index] ?? DEFAULT_SAVE_STATE;
            return (
              <RecipeCard
                key={`${index}-${recipe.title}`}
                recipe={recipe}
                saved={state.saved}
                isSaving={state.isSaving}
                saveError={state.error}
                onToggleSave={() => handleToggleSave(index, recipe)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
